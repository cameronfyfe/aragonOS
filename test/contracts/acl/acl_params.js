const { assertRevert } = require('../../helpers/assertThrow')
const { skipSuiteCoverage } = require('../../helpers/coverage')
const { permissionParamEqOracle } = require('../../helpers/permissionParams')

const ACL = artifacts.require('ACL')
const Kernel = artifacts.require('Kernel')
const KernelProxy = artifacts.require('KernelProxy')

const AcceptOracle = artifacts.require('AcceptOracle')
const RejectOracle = artifacts.require('RejectOracle')
const RevertOracle = artifacts.require('RevertOracle')
const AssertOracle = artifacts.require('AssertOracle')
const OnlyOwnerOracle = artifacts.require('OnlyOwnerOracle')
const OverGasLimitOracle = artifacts.require('OverGasLimitOracle')
const StateModifyingOracle = artifacts.require('StateModifyingOracle')

const ANY_ADDR = '0xffffffffffffffffffffffffffffffffffffffff'
const MAX_GAS_AVAILABLE = 6900000

const getExpectedGas = gas => gas * 63 / 64

contract('ACL params', ([permissionsRoot, specificEntity, noPermission, mockAppAddress]) => {
  let aclBase, kernelBase, acl, kernel
  const MOCK_APP_ROLE = '0xAB'

  before(async () => {
    kernelBase = await Kernel.new(true) // petrify immediately
    aclBase = await ACL.new()
  })

  beforeEach(async () => {
    kernel = Kernel.at((await KernelProxy.new(kernelBase.address)).address)
    await kernel.initialize(aclBase.address, permissionsRoot)
    acl = ACL.at(await kernel.acl())
    await acl.createPermission(permissionsRoot, mockAppAddress, MOCK_APP_ROLE, permissionsRoot)
  })

  // More complex cases are checked via the solidity test in TestAclInterpreter.sol
  context('> ACL Oracle', () => {
    let aclParams

    const testOraclePermissions = ({ allowsAnyAddress, allowsSpecificAddress }) => {
      describe('when permission is set for ANY_ADDR', () => {
        beforeEach(async () => {
          await acl.grantPermissionP(ANY_ADDR, mockAppAddress, MOCK_APP_ROLE, [aclParams])
        })

        it(`ACL ${allowsAnyAddress ? 'allows' : 'disallows'} actions for ANY_ADDR`, async () => {
          const assertion = allowsAnyAddress ? assert.isTrue : assert.isFalse
          assertion(await acl.hasPermission(ANY_ADDR, mockAppAddress, MOCK_APP_ROLE))
        })

        it(`ACL ${allowsSpecificAddress ? 'allows' : 'disallows'} actions for specific address`, async () => {
          const assertion = allowsSpecificAddress ? assert.isTrue : assert.isFalse
          assertion(await acl.hasPermission(specificEntity, mockAppAddress, MOCK_APP_ROLE))
        })

        it(`ACL ${allowsAnyAddress ? 'allows' : 'disallows'} actions other address`, async () => {
          const assertion = allowsAnyAddress ? assert.isTrue : assert.isFalse
          assertion(await acl.hasPermission(noPermission, mockAppAddress, MOCK_APP_ROLE))
        })
      })

      describe('when permission is set for specific address', async () => {
        beforeEach(async () => {
          await acl.grantPermissionP(specificEntity, mockAppAddress, MOCK_APP_ROLE, [aclParams])
        })

        it(`ACL ${allowsSpecificAddress ? 'allows' : 'disallows'} actions for specific address`, async () => {
          const assertion = allowsSpecificAddress ? assert.isTrue : assert.isFalse
          assertion(await acl.hasPermission(specificEntity, mockAppAddress, MOCK_APP_ROLE))
        })

        it('ACL disallows actions for ANY_ADDR', async () => {
          assert.isFalse(await acl.hasPermission(ANY_ADDR, mockAppAddress, MOCK_APP_ROLE))
        })

        it('ACL disallows other address', async () => {
          assert.isFalse(await acl.hasPermission(noPermission, mockAppAddress, MOCK_APP_ROLE))
        })
      })
    }

    describe('when the oracle accepts always', () => {
      before(async () => {
        const acceptOracle = await AcceptOracle.new()
        aclParams = permissionParamEqOracle(acceptOracle.address)
      })

      testOraclePermissions({ allowsAnyAddress: true, allowsSpecificAddress: true })
    })

    describe('when the oracle accepts specific addresses', () => {
      before(async () => {
        const onlyOwnerOracle = await OnlyOwnerOracle.new(specificEntity)
        aclParams = permissionParamEqOracle(onlyOwnerOracle.address)
      })

      testOraclePermissions({ allowsAnyAddress: false, allowsSpecificAddress: true })
    })

    for (const [description, FailingOracle] of [
      ['rejects', RejectOracle],
      ['reverts', RevertOracle],
    ]) {
      describe(`when the oracle ${description}`, () => {
        let failingOracle

        before(async () => {
          failingOracle = await FailingOracle.new()
          aclParams = permissionParamEqOracle(failingOracle.address)
        })

        testOraclePermissions({ allowsAnyAddress: false, allowsSpecificAddress: false })
      })
    }

    describe('when the oracle modifies state', () => {
      let stateModifyingOracle

      before(async () => {
        stateModifyingOracle = await StateModifyingOracle.new()
        aclParams = permissionParamEqOracle(stateModifyingOracle.address)
      })

      testOraclePermissions({ allowsAnyAddress: false, allowsSpecificAddress: false })
    })

    // Both the assert and oog gas cases should be similar, since assert should eat all the available gas
    for (const [description, FailingOutOfGasOracle] of [
      ['asserts', AssertOracle],
      ['uses all available gas', OverGasLimitOracle],
    ]) {
      skipSuiteCoverage(describe)(`when the oracle ${description}`, () => {
        let overGasLimitOracle

        before(async () => {
          overGasLimitOracle = await FailingOutOfGasOracle.new()
          aclParams = permissionParamEqOracle(overGasLimitOracle.address)
        })

        testOraclePermissions({ allowsAnyAddress: false, allowsSpecificAddress: false })

        describe('gas', () => {
          describe('when permission is set for ANY_ADDR', () => {
            // Note `evalParams()` is called twice when calling `hasPermission` for `ANY_ADDR`, so
            // gas costs are much, much higher to compensate for the 63/64th rule on the second call
            const MEDIUM_GAS = 3500000
            const LOW_GAS = 2900000

            beforeEach(async () => {
              await acl.grantPermissionP(ANY_ADDR, mockAppAddress, MOCK_APP_ROLE, [aclParams])
            })

            it('ACL disallows and uses all gas when given large amount of gas', async () => {
              assert.isFalse(await acl.hasPermission(ANY_ADDR, mockAppAddress, MOCK_APP_ROLE, { gas: MAX_GAS_AVAILABLE }))

              const hasPermissionTxHash = await acl.hasPermission.sendTransaction(ANY_ADDR, mockAppAddress, MOCK_APP_ROLE, { gas: MAX_GAS_AVAILABLE })
              const hasPermissionGasConsumed = web3.eth.getTransactionReceipt(hasPermissionTxHash).gasUsed
              // Surprisingly, the actual gas used is quite a lot lower than expected, but it is
              // unclear if this is a ganache issue or if there are gas refunds we're not taking
              // into account
              assert.closeTo(hasPermissionGasConsumed, getExpectedGas(MAX_GAS_AVAILABLE), 105000)
            })

            it('ACL disallows and uses all gas when given medium amount of gas', async () => {
              assert.isFalse(await acl.hasPermission(ANY_ADDR, mockAppAddress, MOCK_APP_ROLE, { gas: MEDIUM_GAS }))

              const hasPermissionTxHash = await acl.hasPermission.sendTransaction(ANY_ADDR, mockAppAddress, MOCK_APP_ROLE, { gas: MEDIUM_GAS })
              const hasPermissionGasConsumed = web3.eth.getTransactionReceipt(hasPermissionTxHash).gasUsed
              assert.closeTo(hasPermissionGasConsumed, getExpectedGas(MEDIUM_GAS), 10000)
            })

            it('ACL reverts when given small amount of gas', async () => {
              await assertRevert(acl.hasPermission(ANY_ADDR, mockAppAddress, MOCK_APP_ROLE, { gas: LOW_GAS }))
            })
          })

          describe('when permission is set for specific address', async () => {
            const MEDIUM_GAS = 200000
            // Note that these gas values are still quite high for causing reverts in "low gas"
            // situations, as we incur some overhead with delegating into proxies and other checks.
            // Assuming we incur 40-60k gas overhead for this, we only have ~140,000 gas left.
            // After the oracle call, we only have 140,000 / 64 ~= 2000 gas left, which begins to
            // quick run out with SLOADs.
            const LOW_GAS = 180000

            beforeEach(async () => {
              await acl.grantPermissionP(specificEntity, mockAppAddress, MOCK_APP_ROLE, [aclParams])
            })

            it('ACL disallows and uses all gas when given large amount of gas', async () => {
              assert.isFalse(await acl.hasPermission(specificEntity, mockAppAddress, MOCK_APP_ROLE, { gas: MAX_GAS_AVAILABLE }))

              const hasPermissionTxHash = await acl.hasPermission.sendTransaction(specificEntity, mockAppAddress, MOCK_APP_ROLE, { gas: MAX_GAS_AVAILABLE })
              const hasPermissionGasConsumed = web3.eth.getTransactionReceipt(hasPermissionTxHash).gasUsed
              // Surprisingly, the actual gas used is quite a lot lower than expected, but it is
              // unclear if this is a ganache issue or if there are gas refunds we're not taking
              // into account
              assert.closeTo(hasPermissionGasConsumed, getExpectedGas(MAX_GAS_AVAILABLE), 105000)
            })

            it('ACL disallows and uses all gas when given medium amount of gas', async () => {
              assert.isFalse(await acl.hasPermission(specificEntity, mockAppAddress, MOCK_APP_ROLE, { gas: MEDIUM_GAS }))

              const hasPermissionTxHash = await acl.hasPermission.sendTransaction(specificEntity, mockAppAddress, MOCK_APP_ROLE, { gas: MEDIUM_GAS })
              const hasPermissionGasConsumed = web3.eth.getTransactionReceipt(hasPermissionTxHash).gasUsed
              assert.closeTo(hasPermissionGasConsumed, getExpectedGas(MEDIUM_GAS), 10000)
            })

            it('ACL reverts when given small amount of gas', async () => {
              await assertRevert(acl.hasPermission(specificEntity, mockAppAddress, MOCK_APP_ROLE, { gas: LOW_GAS }))
            })
          })
        })
      })
    }
  })
})