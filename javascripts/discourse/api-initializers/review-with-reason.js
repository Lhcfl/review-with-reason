import { action } from "@ember/object";
import { ajax } from "discourse/lib/ajax";
import { apiInitializer } from "discourse/lib/api";
import { bind } from "discourse-common/utils/decorators";
import I18n from "I18n";
import ReviewReason from "../components/modal/review-with-reason-form";

/** @param {String} str  */
function expert(str) {
  if (typeof str !== "string") {
    str = "";
  }
  if (str.length > settings.max_length_raw) {
    str = str.slice(0, settings.max_length_raw);
    str += "...\n";
    const quoteStart = str.match(/\[quote[^\]]*\]/g)?.length || 0;
    const quoteEnd = str.match(/\[\/quote\]/g)?.length || 0;
    if (quoteStart > quoteEnd) {
      for (let i = 1; i <= quoteStart - quoteEnd; i++) {
        str = str + "\n[/quote]";
      }
    } else if (quoteStart < quoteEnd) {
      let _str = "";
      for (let i = 1; i <= quoteEnd - quoteStart; i++) {
        _str = _str + "[quote]\n";
      }
      str = _str + str;
    }
  }
  return str;
}

function logger_topic_id({ category_id, type }) {
  const override_map_category = Object.fromEntries(
    settings.logger_topic_id_override_for_catrgories
      .split("|")
      .map((rule) => rule.split("=>").map((s) => Number(s)))
  );
  const override_map_reviewable_type = Object.fromEntries(
    settings.logger_topic_id_override_for_reviewable_type
      .split("|")
      .map((rule) => rule.split("=>"))
  );

  if (override_map_reviewable_type[type]) {
    return override_map_reviewable_type[type];
  }

  if (override_map_category[category_id]) {
    return override_map_category[category_id];
  }

  return Number(settings.logger_topic_id);
}

export default apiInitializer("1.8.0", (api) => {
  api.modifyClass(
    "component:reviewable-item",
    (SuperClass) =>
      class extends SuperClass {
        /**
         * @param {String} reason
         */
        @action
        renderLogPostRawTemplate(performableAction, reason) {
          /** @param {String[]} cols */
          const makeRow = (...cols) => "|" + cols.join("|") + "|";
          const i18nOf = (label) =>
            I18n.t(themePrefix(`review_template.${label}`));
          const reviewable_link = `[/review/${this.reviewable.id}](/review/${this.reviewable.id})`;

          const data = [
            {
              label: "reviewed",
              text: reviewable_link,
            },
            "\n",
            `**${this.reviewable.flaggedReviewableContextQuestion}**`,
            {
              label: "operation",
              text: `${performableAction?.label}. ${
                performableAction?.description || ""
              }`,
            },
            {
              label: "reason",
              text: reason || i18nOf("noreason"),
            },
          ];

          switch (this.reviewable.type) {
            case "ReviewableFlaggedPost":
              data[0].text = I18n.t(
                themePrefix(`review_template.object.post`),
                {
                  url: `[${this.reviewable.topic?.title}](${this.reviewable.target_url})`,
                }
              );

              // eslint-disable-next-line no-unused-vars
              const [_, topic_id, post_number] =
                /^https?:\/\/[^\/]+\/t\/[^\/]+\/(\d+)\/(\d)+/.exec(
                  this.reviewable.target_url
                ) ?? [];
              let quoteSource =
                this.reviewable.target_created_by?.username ?? "";
              if (topic_id) {
                quoteSource += `, post:${post_number}, topic:${topic_id}`;
              }

              data.push(
                `\n[quote="${quoteSource}"]\n${expert(
                  this.reviewable.raw
                )}\n[/quote]\n`,
                {
                  label: "see",
                  text: reviewable_link,
                }
              );
              break;

            case "ReviewableQueuedPost":
              let { title, raw } = this.reviewable.payload ?? {};
              raw = expert(raw);
              const txt = [
                `\n[quote="${
                  this.reviewable.target_created_by?.username ?? ""
                }"]`,
                title ? `## ${title}\n\n---------\n` : "",
                raw,
                "[/quote]\n",
              ].join("\n");

              data.push(txt);
              break;
            default:
              // TODO
              if (this.reviewable.payload) {
                const { username, name, email } = this.reviewable.payload;
                const details = [makeRow(i18nOf("details"), ""), "|---|---|"];
                if (username) {
                  details.push("Username", `[${username}](/u/${username})`);
                }
                if (name) {
                  details.push("Name", `${name}`);
                }
                if (email) {
                  details.push("Email", `${email}`);
                }
              }
              break;
          }

          if (this.reviewable.reviewable_scores) {
            let lines = [
              makeRow(
                i18nOf("reporter"),
                i18nOf("reason"),
                i18nOf("at"),
                i18nOf("addition")
              ),
              "|---|---|---|---|",
              ...this.reviewable.reviewable_scores.map((e) => {
                let additional_reason = e?.reason || "";
                const posts = e?.reviewable_conversation?.conversation_posts;
                if (posts) {
                  for (const post of posts) {
                    let str = `@${post.user?.username} ${post.excerpt || ""}`;
                    str = str
                      .replaceAll("\n", " ")
                      .replaceAll(/<[\s\S]+>/g, " ")
                      .replaceAll("|", "\\|");
                    str = (additional_reason ? "<br> " : "") + str;
                    additional_reason += str;
                  }
                }
                return makeRow(
                  `@${e?.user?.username}`,
                  e?.score_type?.title,
                  e?.created_at,
                  additional_reason
                );
              }),
            ];

            data.push("\n-----\n", lines.join("\n"));
          }

          return data
            .map((d) => {
              if (typeof d === "object" && d.label) {
                return i18nOf(d.label) + ": " + d.text;
              }
              return d;
            })
            .join("\n");
        }

        @action
        shouldSkipTellReason() {
          /** @type {String[]} */
          const skip_for_categories = settings.skip_for_categories.split("|");
          if (
            skip_for_categories.includes(String(this.reviewable.category_id))
          ) {
            return true;
          }
        }

        @bind
        _performConfirmed(performableAction, additionalData = {}) {
          if (additionalData.revise_reason) {
            // TODO
            return super._performConfirmed(performableAction, additionalData);
          }

          if (this.shouldSkipTellReason()) {
            return super._performConfirmed(performableAction, additionalData);
          }

          this.modal.show(ReviewReason, {
            model: {
              allowNoReason: settings.allow_no_reason,
              onSubmit: async (modal) => {
                const raw = this.renderLogPostRawTemplate(
                  performableAction,
                  modal.reason
                );

                await ajax("/posts", {
                  type: "POST",
                  data: {
                    topic_id: logger_topic_id(this.reviewable),
                    raw,
                  },
                });

                super._performConfirmed(performableAction);
              },
            },
          });
        }
      }
  );
});
