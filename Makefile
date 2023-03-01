.PHONY: default
default: build

node_modules: package.json
	yarn
	@touch $@

.PHONY: build
build: node_modules
	yarn compile
