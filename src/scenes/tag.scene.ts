import { SCENES_NAMES } from "@/constants";
import { Context, Markup, Scenes } from "telegraf";
import { Scenario } from "./scene.class";
import { Update } from "telegraf/typings/core/types/typegram";
import { containsSlash } from "@/helpers/containsHash.helper";
import { containsSpecialChars } from "@/helpers/containsSpecialChars.helper";

enum TAG_COMMANDS {
  GET_TAGS = "GET_TAGS",
  ADD_TAG = "ADD_TAG",
  REMOVE_TAG = "REMOVE_TAG",
}

export class TagScene extends Scenario {
  scene: Scenes.BaseScene<Context<Update>> = new Scenes.BaseScene(
    SCENES_NAMES.TAG_SCENE
  );

  constructor() {
    super();
  }

  handle() {
    this.scene.enter((ctx) =>
      ctx.reply(
        "You are in 'Manage tags scene'",
        Markup.inlineKeyboard([
          Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
          Markup.button.callback("Get Tags", TAG_COMMANDS.GET_TAGS),
          Markup.button.callback("Add Tag", TAG_COMMANDS.ADD_TAG),
          Markup.button.callback("Remove Tag", TAG_COMMANDS.REMOVE_TAG),
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
      const tags = (ctx as any).session.tags;

      if (!tags?.length) {
        ctx.reply(
          "You have no one tags. Please, create one",
          Markup.inlineKeyboard([
            Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
            Markup.button.callback("Add Tag", TAG_COMMANDS.ADD_TAG),
          ])
        );

        return;
      }

      ctx.reply(
        tags.join(","),

        Markup.inlineKeyboard([
          Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
          Markup.button.callback("Add Tag", TAG_COMMANDS.ADD_TAG),
          Markup.button.callback("Remove Tag", TAG_COMMANDS.REMOVE_TAG),
        ])
      );
    });

    this.scene.action(SCENES_NAMES.EXIT_FROM_SCENE, (ctx) => {
      (ctx as any).scene.leave();
      ctx.editMessageText("You've come back");
    });

    this.scene.action(TAG_COMMANDS.REMOVE_TAG, (ctx) => {
      const tags = (ctx as any).session.tags || [];

      if (!tags.length) {
        ctx.reply(
          "There are no tags to delete.",
          Markup.inlineKeyboard([
            Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
            Markup.button.callback("Add Tag", TAG_COMMANDS.ADD_TAG),
          ])
        );
        return;
      }

      const buttons = tags.map((tag: any) =>
        Markup.button.callback(tag, `remove_${tag}`)
      );
      ctx.reply(
        "Select tag to delete:",
        Markup.inlineKeyboard([
          Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
          ...buttons,
        ])
      );
    });

    this.scene.action(/remove_(.+)/, (ctx) => {
      const tagToRemove = ctx.match[1];
      (ctx as any).session.tags = (ctx as any).session.tags.filter(
        (tag: string) => tag !== tagToRemove
      );
      ctx.reply(`Tag "${tagToRemove}" was deleted.`);

      (ctx as any).scene.reenter();
    });

    this.scene.on("text", (ctx) => {
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

      let tagsSessionData = (ctx as any).session.tags;
      const tag = messageText.trim().toLowerCase();

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
          `Tag "#${tag}" was added.`,

          Markup.inlineKeyboard([
            Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
            Markup.button.callback("Get Tags", TAG_COMMANDS.GET_TAGS),
            Markup.button.callback("Add new one", TAG_COMMANDS.ADD_TAG),
          ])
        );
      } else {
        ctx.reply(
          `Tag "${tag}" is already exist.`,
          Markup.inlineKeyboard([
            Markup.button.callback("Exit", SCENES_NAMES.EXIT_FROM_SCENE),
            Markup.button.callback("Get Tags", TAG_COMMANDS.GET_TAGS),
            Markup.button.callback("Add new one", TAG_COMMANDS.ADD_TAG),
          ])
        );
      }

      (ctx as any).session.tags = tagsSessionData;
    });
  }
}
