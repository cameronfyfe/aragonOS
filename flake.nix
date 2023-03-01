{
  inputs = {
    flake-utils.url = "github:numtide/flake-utils";
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    nixpkgs-old.url = "github:NixOS/nixpkgs?rev=0e6945185b65ed6a163501d66420f8a16e49e4c3";
    nixpkgs-old-old.url = "github:NixOS/nixpkgs?rev=5ed5e2a39100611d48095e053847d426ae21a2a4";
  };

  outputs = inputs @ { self, ... }:
    (inputs.flake-utils.lib.eachSystem [ "x86_64-linux" ] (system:
      let

        pkgs = import inputs.nixpkgs {
          inherit system;
        };

        pkgs-old = import inputs.nixpkgs-old {
          inherit system;
        };

        pkgs-old-old = import inputs.nixpkgs-old-old {
          inherit system;
        };

        nodeAndYarn = nodejs: [ nodejs (pkgs.yarn.override { inherit nodejs; }) ];

        nodeAndYarn16 = nodeAndYarn pkgs.nodejs-16_x;
        nodeAndYarn12 = nodeAndYarn pkgs-old.nodejs-12_x;
        nodeAndYarn10 = nodeAndYarn pkgs-old-old.nodejs-10_x;

        buildInputs = with pkgs; [
          cmake
          python3
        ] ++ nodeAndYarn10;

      in
      rec {

        devShells = {
          default = pkgs.mkShell {
            inherit buildInputs;
          };
        };

      }));
}
