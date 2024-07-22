export class Singleton {
  private static instance: Singleton;

  map: Map<any, any> = new Map();

  private constructor() {}

  public static get(): Singleton {
    if (!Singleton.instance) {
      Singleton.instance = new Singleton();
    }

    return Singleton.instance;
  }
}
