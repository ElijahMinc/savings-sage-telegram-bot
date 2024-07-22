import { Context, Scenes } from "telegraf";
import { Update } from "telegraf/typings/core/types/typegram";


export abstract class Scenario {
  scene: Scenes.BaseScene<Context<Update>> | undefined;

  abstract handle(): void;

  get scenarios() {
    return this.scene;
  }
}
