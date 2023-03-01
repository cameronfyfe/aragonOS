#!/usr/bin/env bash

set -xeu

version=$(jq -r '.version' package.json)
branch=$(git rev-parse --abbrev-ref HEAD)
commit=$(git rev-parse --short HEAD)

commitVersion="$version-$branch-$( \
  [[ -z $(git status -s) ]] \
    && echo "$commit" \
    || echo "dirty-$(date '+%Y-%m-%d-%H-%M-%S')" \
)"

yarn version --new-version "$version-$branch-$commitSuffix" --no-git-tag-version
npm publish --tag $commit
