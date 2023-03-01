.PHONY: default
default: build

node_modules: package.json | _gitConfig
	git config url."https://".insteadOf git://
	yarn
	@touch $@

.PHONY: build
build: node_modules
	yarn compile

# use https to avoid error fetching git://github.com/frozeman/WebSocket-Node.git
.PHONY: _gitConfig
_gitConfig:
	git config url."https://".insteadOf git://
