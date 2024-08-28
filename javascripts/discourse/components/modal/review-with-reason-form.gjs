import Component from "@glimmer/component";
import { tracked } from "@glimmer/tracking";
import { fn } from "@ember/helper";
import { on } from "@ember/modifier";
import { action } from "@ember/object";
import { not } from "truth-helpers";
import ConditionalLoadingSpinner from "discourse/components/conditional-loading-spinner";
import DButton from "discourse/components/d-button";
import DModal from "discourse/components/d-modal";
import DModalCancel from "discourse/components/d-modal-cancel";
import withEventValue from "discourse/helpers/with-event-value";
import { popupAjaxError } from "discourse/lib/ajax-error";
import i18n from "discourse-common/helpers/i18n";

export default class ReviewWithReasonForm extends Component {
  @tracked loading = false;
  @tracked reason = "";

  @action
  async submit() {
    this.loading = true;
    try {
      await this.args.model.onSubmit(this);
    } catch (err) {
      popupAjaxError(err);
    }
    this.loading = false;
    this.close();
  }

  @action
  close() {
    this.args.closeModal();
  }

  get canSubmit() {
    if (this.loading) {
      return false;
    }
    return this.args.model.allowNoReason ? true : this.reason.length > 0;
  }

  <template>
    <form class="review-with-reason-form">
      <DModal
        @title={{i18n (themePrefix "tell_reason")}}
        @closeModal={{@closeModal}}
      >
        <:body>
          <div class="control-group">
            <textarea
              value={{this.reason}}
              {{on "input" (withEventValue (fn (mut this.reason)))}}
              min-width="500px"
              min-height="400px"
              max-height="1000px"
              resize="both"
            />
          </div>
        </:body>

        <:footer>
          <DButton
            @class="btn-primary"
            @label="ok_value"
            @action={{this.submit}}
            @disabled={{not this.canSubmit}}
          />
          <DModalCancel @close={{@closeModal}} />
          <ConditionalLoadingSpinner
            @size="small"
            @condition={{this.loading}}
          />
        </:footer>
      </DModal>
    </form>
  </template>
}
