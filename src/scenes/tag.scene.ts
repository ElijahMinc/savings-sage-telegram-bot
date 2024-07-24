import {
  COMMAND_NAMES,
  DEFAULT_VALUE_SCENE_LIFECYCLE_IN_SECONDS,
  EXIT_BUTTON,
  SCENES_NAMES,
} from "@/constants";
import { Markup, Scenes } from "telegraf";
import { Scenario } from "./scene.class";
import { containsSlash } from "@/helpers/containsHash.helper";
import { containsSpecialChars } from "@/helpers/containsSpecialChars.helper";
import { compressWord } from "@/helpers/compressWord";
import { SceneContexts } from "@/context/context.interface";
import * as emoji from "node-emoji";

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
        `Manage your tags here `,

        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              `Get Tags ${emoji.get("sparkles")}`,
              TAG_COMMANDS.GET_TAGS
            ),
            Markup.button.callback(
              `Add Tag ${emoji.get("heavy_plus_sign")}`,
              TAG_COMMANDS.ADD_TAG
            ),
            Markup.button.callback(
              `Remove Tag ${emoji.get("wastebasket")}`,
              TAG_COMMANDS.REMOVE_TAG
            ),
          ],
          [EXIT_BUTTON],
        ])
      )
    );

    this.scene.action(TAG_COMMANDS.ADD_TAG, (ctx) => {
      ctx.reply("Please, input your tag", Markup.inlineKeyboard([EXIT_BUTTON]));
    });

    this.scene.action(TAG_COMMANDS.GET_TAGS, (ctx) => {
      const tags = ctx.session.tags;

      if (!tags?.length) {
        ctx.reply(
          "You have no one tags. Please, create one",
          Markup.inlineKeyboard([
            [Markup.button.callback("Add Tag", TAG_COMMANDS.ADD_TAG)],
            [EXIT_BUTTON],
          ])
        );

        return;
      }

      ctx.reply(
        tags.join(","),

        Markup.inlineKeyboard([
          [Markup.button.callback("Add Tag", TAG_COMMANDS.ADD_TAG)],
          [EXIT_BUTTON],
        ])
      );
    });

    this.scene.action(SCENES_NAMES.EXIT_FROM_SCENE, (ctx) => {
      ctx.scene.leave();
      ctx.reply("You've come back");
    });

    this.scene.action(TAG_COMMANDS.REMOVE_TAG, (ctx) => {
      const tags = ctx.session.tags || [];

      if (!tags.length) {
        ctx.reply(
          "There are no tags to delete.",
          Markup.inlineKeyboard([
            [Markup.button.callback("Add Tag", TAG_COMMANDS.ADD_TAG)],
            [EXIT_BUTTON],
          ])
        );
        return;
      }

      const buttons = tags.map((tag: string) =>
        Markup.button.callback(tag, `remove_${tag}`)
      );
      ctx.reply(
        "Select tag to delete:",
        Markup.inlineKeyboard([[...buttons], [EXIT_BUTTON]])
      );
    });

    this.scene.action(/remove_(.+)/, (ctx) => {
      const tagToRemove = ctx.match[1];
      const session = ctx.session;

      session.tags = session.tags.filter((tag: string) => tag !== tagToRemove);
      ctx.reply(`Tag "${tagToRemove}" was deleted ${emoji.get("wastebasket")}`);

      ctx.scene.reenter();
    });

    this.scene.on("text", (ctx) => {
      const session = ctx.session;
      const messageText = ctx.message?.text;

      if (!messageText) return;

      if (containsSlash(messageText)) {
        ctx.reply(
          `You are in /${
            COMMAND_NAMES.TAGS
          } scene. Please input text message according to the following rule:
          ${emoji.get("shape")} Without symbols;
          ${emoji.get("shape")} In lowercase;
          ${emoji.get("shape")} Not a number;
          ${emoji.get(
            "shape"
          )} The length of the tag name should not be longer than 10 characters;`,
          Markup.inlineKeyboard([EXIT_BUTTON])
        );
        return;
      }

      if (containsSpecialChars(messageText)) {
        ctx.reply(
          `${emoji.get(
            "shape"
          )} You should write text message without symbols, in lowercase`,

          Markup.inlineKeyboard([EXIT_BUTTON])
        );

        return;
      }

      const isNumber = !isNaN(Number(messageText));

      if (isNumber) {
        ctx.reply(
          `${emoji.get("shape")} The tag name should be text`,
          Markup.inlineKeyboard([EXIT_BUTTON])
        );
        return;
      }

      if (messageText.length >= 10) {
        ctx.reply(
          `${emoji.get(
            "shape"
          )} The length of the tag name should not be longer than 10 characters`,
          Markup.inlineKeyboard([EXIT_BUTTON])
        );
        return;
      }

      let tagsSessionData = session.tags;

      const tag = compressWord(messageText);

      if (!tag) {
        ctx.reply(
          `${emoji.get("shape")} The tag cannot be empty. Please enter the tag.`
        );
        return;
      }

      if (!tagsSessionData) {
        tagsSessionData = [];
      }

      if (!tagsSessionData.includes(tag)) {
        tagsSessionData.push(`#${tag}`);

        ctx.reply(
          `${emoji.get("stars")} Tag "${tag}" was added ${emoji.get("stars")}`,

          Markup.inlineKeyboard([
            [
              Markup.button.callback("Get Tags", TAG_COMMANDS.GET_TAGS),
              Markup.button.callback("Add new one", TAG_COMMANDS.ADD_TAG),
              Markup.button.callback("Remove Tag", TAG_COMMANDS.REMOVE_TAG),
            ],
            [EXIT_BUTTON],
          ])
        );
      } else {
        ctx.reply(
          `${emoji.get("stars")} Tag "${tag}" is already exist ${emoji.get(
            "stars"
          )}`,
          Markup.inlineKeyboard([
            [
              Markup.button.callback("Get Tags", TAG_COMMANDS.GET_TAGS),
              Markup.button.callback("Add new one", TAG_COMMANDS.ADD_TAG),
            ],
            [EXIT_BUTTON],
          ])
        );
      }

      ctx.session.tags = tagsSessionData;
    });
  }
}
