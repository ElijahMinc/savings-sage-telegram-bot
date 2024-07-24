import { IBotContext, SceneContexts } from "@/context/context.interface";
import { Scenes } from "telegraf";

export abstract class Scenario {
  scene:
    | Scenes.BaseScene<SceneContexts<"TagScene" | "ExpenseTransactionScene">>
    | undefined;

  abstract handle(): void;

  get scenarios() {
    return this.scene;
  }
}
