/*
 * SPDX-License-Identifier:    MIT
 */

pragma solidity ^0.4.24;
pragma experimental ABIEncoderV2;

library LibSubDaoProvider {
    struct SubDaoInfo {
        string name;
        address addr;
    }
}

interface ISubDaoProvider {
    function isSubDaoProvider() external pure returns (bool);

    function getSubDaos()
        external
        view
        returns (LibSubDaoProvider.SubDaoInfo[] memory);
}
