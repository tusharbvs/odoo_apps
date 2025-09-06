/** @odoo-module **/

import publicWidget from "@web/legacy/js/public/public_widget";

publicWidget.registry.BlogFontSizeControl = publicWidget.Widget.extend({
    selector: "#font_size_controls",

    start() {
        this.fontSize = 16;
        this.$content = $(".o_wblog_post_content_field");
        
        this._applyFontSize();

        this.$("#increase_font").on("click", () => {
            this.fontSize += 2;
            this._applyFontSize();
        });

        this.$("#decrease_font").on("click", () => {
            this.fontSize -= 2;
            this._applyFontSize();
        });

        this.$("#reset_font").on("click", () => {
            this.fontSize = 16;
            this._applyFontSize();
        });

        return this._super(...arguments);
    },
    _applyFontSize() {
        if (this.$content.length) {
            this.$content.css("font-size", `${this.fontSize}px`);
            this.$content.find("*").css("font-size", `${this.fontSize}px`);
        }
    },
});
