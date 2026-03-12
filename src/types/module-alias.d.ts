declare module "module-alias" {
  export function addAliases(aliases: Record<string, string>): void;

  const moduleAlias: {
    addAliases: typeof addAliases;
  };

  export default moduleAlias;
}
