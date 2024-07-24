import {
  DEFAULT_VALUE_SCENE_LIFECYCLE_IN_SECONDS,
  SCENES_NAMES,
} from "@/constants";
import { Context, Markup, Scenes } from "telegraf";
import { Scenario } from "./scene.class";
import { containsSlash } from "@/helpers/containsHash.helper";
import { containsSpecialChars } from "@/helpers/containsSpecialChars.helper";
import { compressWord } from "@/helpers/compressWord";
import { IBotContext, SceneContexts } from "@/context/context.interface";

enum TAG_COMMANDS {
  GET_TAGS = "GET_TAGS",
  ADD_TAG = "ADD_TAG",
  REMOVE_TAG = "REMOVE_TAG",
}

export class TagScene extends Scenario {
  scene: Scenes.BaseScene<SceneContexts<"TagScene">> = new Scenes.BaseScene(
    SCENES_NAMES.TAG_SCENE,
    {
      ttl: DEFAULT_VALUE_SCENE_LIFECYCLE_IN_SECONDS,
      handlers: [],
      enterHandlers: [],
      leaveHandlers: [],
    }
  );

  constructor() {
    super();
  }

  handle() {
    this.scene.enter((ctx) =>
      ctx.reply(
        "Manage your tags here",

        Markup.inlineKeyboard([
          [
            Markup.button.callback("Get Tags", TAG_COMMANDS.GET_TAGS),
            Markup.button.callback("Add Tag", TAG_COMMANDS.ADD_TAG),
            Markup.button.callback("Remove Tag", TAG_COMMANDS.REMOVE_TAG),
          ],
          [Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE)],
        ])
      )
    );

    this.scene.action(TAG_COMMANDS.ADD_TAG, (ctx) => {
      ctx.reply(
        "Please, input your tag",
        Markup.inlineKeyboard([
          Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
        ])
      );
    });

    this.scene.action(TAG_COMMANDS.GET_TAGS, (ctx) => {
      const tags = ctx.session.tags;

      if (!tags?.length) {
        ctx.reply(
          "You have no one tags. Please, create one",
          Markup.inlineKeyboard([
            [Markup.button.callback("Add Tag", TAG_COMMANDS.ADD_TAG)],
            [Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE)],
          ])
        );

        return;
      }

      ctx.reply(
        tags.join(","),

        Markup.inlineKeyboard([
          [Markup.button.callback("Add Tag", TAG_COMMANDS.ADD_TAG)],
          [Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE)],
        ])
      );
    });

    this.scene.action(SCENES_NAMES.EXIT_FROM_SCENE, (ctx) => {
      ctx.scene.leave();
      ctx.reply("You've left the scene and came back");
    });

    this.scene.action(TAG_COMMANDS.REMOVE_TAG, (ctx) => {
      const tags = ctx.session.tags || [];

      if (!tags.length) {
        ctx.reply(
          "There are no tags to delete.",
          Markup.inlineKeyboard([
            [Markup.button.callback("Add Tag", TAG_COMMANDS.ADD_TAG)],
            [Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE)],
          ])
        );
        return;
      }

      const buttons = tags.map((tag: string) =>
        Markup.button.callback(tag, `remove_${tag}`)
      );
      ctx.reply(
        "Select tag to delete:",
        Markup.inlineKeyboard([
          [...buttons],
          [Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE)],
        ])
      );
    });

    this.scene.action(/remove_(.+)/, (ctx) => {
      const tagToRemove = ctx.match[1];
      const session = ctx.session;

      session.tags = session.tags.filter((tag: string) => tag !== tagToRemove);
      ctx.reply(`Tag "${tagToRemove}" was deleted.`);

      ctx.scene.reenter();
    });

    this.scene.on("text", (ctx) => {
      const session = ctx.session;
      const messageText = ctx.message?.text;

      if (!messageText) return;

      if (containsSlash(messageText)) {
        ctx.reply(
          `If you want to change this Scene to another one use button below`,
          Markup.inlineKeyboard([
            Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
          ])
        );
        return;
      }

      if (containsSpecialChars(messageText)) {
        ctx.reply(
          "You should write text message without symbols, in lowercase",

          Markup.inlineKeyboard([
            Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
          ])
        );

        return;
      }

      const isNumber = !isNaN(Number(messageText));

      if (isNumber) {
        ctx.reply(
          `The tag name should be text`,
          Markup.inlineKeyboard([
            Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
          ])
        );
        return;
      }

      if (messageText.length >= 10) {
        ctx.reply(
          `The length of the tag name should not be longer than 10 characters`,
          Markup.inlineKeyboard([
            Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
          ])
        );
        return;
      }

      let tagsSessionData = session.tags;

      const tag = compressWord(messageText);

      if (!tag) {
        ctx.reply("The tag cannot be empty. Please enter the tag.");
        return;
      }

      if (!tagsSessionData) {
        tagsSessionData = [];
      }

      if (!tagsSessionData.includes(tag)) {
        tagsSessionData.push(`#${tag}`);

        ctx.reply(
          `Tag "${tag}" was added.`,

          Markup.inlineKeyboard([
            [
              Markup.button.callback("Get Tags", TAG_COMMANDS.GET_TAGS),
              Markup.button.callback("Add new one", TAG_COMMANDS.ADD_TAG),
              Markup.button.callback("Remove Tag", TAG_COMMANDS.REMOVE_TAG),
            ],
            [Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE)],
          ])
        );
      } else {
        ctx.reply(
          `Tag "${tag}" is already exist.`,
          Markup.inlineKeyboard([
            [
              Markup.button.callback("Get Tags", TAG_COMMANDS.GET_TAGS),
              Markup.button.callback("Add new one", TAG_COMMANDS.ADD_TAG),
            ],
            [Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE)],
          ])
        );
      }

      ctx.session.tags = tagsSessionData;
    });
  }
}
