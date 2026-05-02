/** @odoo-module **/

import { Component, useState, onMounted, onWillUnmount } from "@odoo/owl";
import { registry }   from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function safeEval(expr) {
    const norm = expr
        .replace(/×/g, "*")
        .replace(/÷/g, "/")
        .replace(/-/g, "-");
    if (!/^[\d+\-*/.() ]+$/.test(norm)) throw new Error("Invalid expression");
    // eslint-disable-next-line no-new-func
    const result = Function('"use strict"; return (' + norm + ")")();
    if (!isFinite(result) || isNaN(result)) throw new Error("Division by zero");
    return result;
}

function fmt(num, trailingDot = false) {
    const rounded = Math.round(Number(num) * 1e10) / 1e10;
    const [int, dec] = rounded.toString().split(".");
    const intFmt = Number(int).toLocaleString("en-US");
    const result = dec !== undefined ? intFmt + "." + dec : intFmt;
    return trailingDot ? result + "." : result;
}

function fmtMoney(n) {
    return Number(n).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

// ─── Mode definitions ─────────────────────────────────────────────────────────

const MODES = [
    { key: "basic",    label: "Basic",    disabled: false },
    { key: "advanced", label: "Advanced", disabled: false },
];

// ─── SmartCalculatorPanel ─────────────────────────────────────────────────────

class SmartCalculatorPanel extends Component {
    static template = "bvs_smart_calculator_pro.SmartCalculatorPanel";
    static props = {
        history:      { type: Array },
        onAddHistory: { type: Function },
        onHide:       { type: Function },
        onClose:      { type: Function },
    };

    setup() {
        this.MODES      = MODES;
        this.taxService = useService("bvs_smart_calculator_tax");

        this.state = useState({
            // ── Mode ─────────────────────────────────────────────────────────
            mode: "basic",

            // ── Calculator engine ────────────────────────────────────────────
            tokens:       [],
            currentInput: "0",
            inputPending: false,
            memory:       0,
            hasMemory:    false,
            justEvaled:   false,
            openBrackets: 0,
            error:        false,

            // ── Business side panel state ─────────────────────────────────────
            // bizOp: null | "markup" | "margin" | "discount" | "tax" | "landed"
            //
            // Side panel width states (driven by CSS classes):
            //   justEvaled=false            → sc-biz-side width: 0      (hidden)
            //   justEvaled=true, bizOp=null → sc-biz-side-open  (68px,  icon col only)
            //   justEvaled=true, bizOp≠null → sc-biz-side-expanded (240px, full panel)
            bizOp:        null,
            bizPct:       "",
            bizLanded:    { freight: "", duties: "", other: "" },
            bizResult:    null,     // { lines:[{label,value}] } | { error:string }

            // Tax sub-state
            taxes:        [],
            taxesLoading: false,
        });

        // Prevents async RPC from mutating state after component unmounts
        this._mounted   = false;
        this._drag      = { active: false, startX: 0, startY: 0, origX: 0, origY: 0 };
        this._wrapperEl = null;

        onMounted(() => {
            this._mounted = true;
            this._onMM  = this._onMouseMove.bind(this);
            this._onMU  = this._onMouseUp.bind(this);
            this._onKey = this._onKeyDown.bind(this);
            document.addEventListener("mousemove", this._onMM);
            document.addEventListener("mouseup",   this._onMU);
            document.addEventListener("keydown",   this._onKey);
        });

        onWillUnmount(() => {
            this._mounted = false;
            document.removeEventListener("mousemove", this._onMM);
            document.removeEventListener("mouseup",   this._onMU);
            document.removeEventListener("keydown",   this._onKey);
        });
    }

    // ── Computed properties ───────────────────────────────────────────────────

    get displayExpression() { return this.state.tokens.join(" "); }

    get displayValue() {
        const s = this.state;
        if (s.error) return "Error";
        if (!s.inputPending && !s.justEvaled) return "0";
        const raw         = s.currentInput;
        const trailingDot = raw.endsWith(".");
        const n           = parseFloat(raw);
        return isNaN(n) ? raw : fmt(n, trailingDot);
    }

    get memDisplay()       { return this.state.hasMemory ? "M = " + fmt(this.state.memory) : ""; }
    get bracketIndicator() { return "(".repeat(this.state.openBrackets); }

    /** True when the side panel should be in its wide (expanded) state. */
    get bizOpActive() { return this.state.bizOp !== null; }

    /** Base value for all business operations (current display result). */
    get bizBase()  { return parseFloat(this.state.currentInput) || 0; }

    /**
     * Human-readable label shown in the expand area header.
     * Kept short to fit within 172px.
     */
    get opLabel() {
        const map = {
            markup:   "Markup %",
            margin:   "Margin %",
            discount: "Discount %",
            tax:      "Tax",
            landed:   "Landed Cost",
        };
        return this.state.bizOp ? (map[this.state.bizOp] || "") : "";
    }

    // ── Mode switching ────────────────────────────────────────────────────────

    switchMode(key) {
        const mode = MODES.find(m => m.key === key);
        if (!mode || mode.disabled || this.state.mode === key) return;
        this.state.mode = key;
        this._resetCalc();
    }

    _resetCalc() {
        const s        = this.state;
        s.tokens       = [];
        s.currentInput = "0";
        s.inputPending = false;
        s.justEvaled   = false;
        s.openBrackets = 0;
        s.error        = false;
        s.bizOp        = null;
        s.bizPct       = "";
        s.bizResult    = null;
        s.bizLanded    = { freight: "", duties: "", other: "" };
    }

    // ── Main button handler ───────────────────────────────────────────────────

    onButton(value) {
        const s         = this.state;
        const OPERATORS = ["+", "-", "×", "÷"];
        const isOp      = v => OPERATORS.includes(v);
        const lastTok   = () => s.tokens.length ? s.tokens[s.tokens.length - 1] : null;

        if (s.error && value !== "C") s.error = false;

        switch (value) {

            case "C":
                this._resetCalc();
                break;

            case "CE":
                s.currentInput = "0";
                s.inputPending = false;
                s.error        = false;
                s.bizOp        = null;
                s.bizPct       = "";
                s.bizResult    = null;
                break;

            case "⌫":
                if (s.justEvaled) {
                    s.currentInput = "0"; s.inputPending = false; s.justEvaled = false;
                    s.bizOp = null; s.bizResult = null; s.bizPct = "";
                } else if (s.inputPending && s.currentInput.length > 1) {
                    s.currentInput = s.currentInput.slice(0, -1);
                    if (s.currentInput === "-") { s.currentInput = "0"; s.inputPending = false; }
                } else {
                    s.currentInput = "0"; s.inputPending = false;
                }
                break;

            case "0": case "1": case "2": case "3": case "4":
            case "5": case "6": case "7": case "8": case "9":
                if (s.justEvaled) {
                    s.tokens = []; s.openBrackets = 0;
                    s.currentInput = value; s.inputPending = true; s.justEvaled = false;
                    s.bizOp = null; s.bizResult = null; s.bizPct = "";
                } else if (!s.inputPending) {
                    s.currentInput = value; s.inputPending = true;
                } else {
                    const digits = s.currentInput.replace(/[^0-9]/g, "").length;
                    if (digits < 15) s.currentInput += value;
                }
                break;

            case ".":
                if (s.justEvaled) {
                    s.tokens = []; s.openBrackets = 0;
                    s.currentInput = "0."; s.inputPending = true; s.justEvaled = false;
                    s.bizOp = null; s.bizResult = null; s.bizPct = "";
                } else if (!s.inputPending) {
                    s.currentInput = "0."; s.inputPending = true;
                } else if (!s.currentInput.includes(".")) {
                    s.currentInput += ".";
                }
                break;

            case "+": case "-": case "×": case "÷": {
                const lt = lastTok();
                if (s.justEvaled) {
                    s.tokens = [s.currentInput, value];
                    s.currentInput = "0"; s.inputPending = false; s.justEvaled = false;
                    s.bizOp = null; s.bizResult = null; s.bizPct = "";
                } else if (isOp(lt) && !s.inputPending) {
                    s.tokens = [...s.tokens.slice(0, -1), value];
                } else if (s.inputPending) {
                    s.tokens = [...s.tokens, s.currentInput, value];
                    s.currentInput = "0"; s.inputPending = false;
                } else if (lt === ")") {
                    s.tokens = [...s.tokens, value];
                } else {
                    s.tokens = ["0", value]; s.currentInput = "0"; s.inputPending = false;
                }
                break;
            }

            case "(": {
                s.justEvaled = false;
                const lt     = lastTok();
                if (s.inputPending) {
                    s.tokens = [...s.tokens, s.currentInput, "×", "("];
                } else if (lt !== null && !isOp(lt) && lt !== "(") {
                    s.tokens = [...s.tokens, "×", "("];
                } else {
                    s.tokens = [...s.tokens, "("];
                }
                s.currentInput = "0"; s.inputPending = false; s.openBrackets++;
                break;
            }

            case ")": {
                if (s.openBrackets <= 0) break;
                const lt = lastTok();
                if (s.inputPending) {
                    s.tokens = [...s.tokens, s.currentInput, ")"];
                } else if (lt === "(") {
                    s.tokens = [...s.tokens, "0", ")"];
                } else {
                    s.tokens = [...s.tokens, ")"];
                }
                s.currentInput = "0"; s.inputPending = false; s.openBrackets--;
                break;
            }

            case "±":
                if ((!s.inputPending && !s.justEvaled) || s.currentInput === "0") break;
                s.currentInput = s.currentInput.startsWith("-")
                    ? s.currentInput.slice(1)
                    : "-" + s.currentInput;
                break;

            case "%": {
                if (!s.inputPending && !s.justEvaled) break;
                const pct = parseFloat(s.currentInput) / 100;
                s.currentInput = (Math.round(pct * 1e10) / 1e10).toString();
                s.inputPending = true;
                break;
            }

            case "MC":
                if (!s.hasMemory) break;
                s.memory = 0; s.hasMemory = false;
                break;

            case "MR":
                if (!s.hasMemory) break;
                s.currentInput = s.memory.toString();
                s.inputPending = true; s.justEvaled = false;
                break;

            case "M+": {
                const v = parseFloat(s.currentInput) || 0;
                s.memory = Math.round((s.memory + v) * 1e10) / 1e10;
                s.hasMemory = true;
                break;
            }

            case "M-": {
                const v = parseFloat(s.currentInput) || 0;
                s.memory = Math.round((s.memory - v) * 1e10) / 1e10;
                s.hasMemory = true;
                break;
            }

            case "=": {
                try {
                    let evalToks = [...s.tokens];
                    const lt     = lastTok();
                    if (s.inputPending)        evalToks.push(s.currentInput);
                    else if (isOp(lt))         evalToks.push(s.currentInput);
                    if (evalToks.length === 0) evalToks = [s.currentInput || "0"];
                    for (let i = 0; i < s.openBrackets; i++) evalToks.push(")");

                    const expr    = evalToks.join(" ");
                    const result  = safeEval(expr);
                    const rounded = Math.round(result * 1e10) / 1e10;

                    this.props.onAddHistory(expr, rounded);

                    s.tokens       = [...evalToks, "="];
                    s.currentInput = rounded.toString();
                    s.inputPending = false;
                    s.openBrackets = 0;
                    s.justEvaled   = true;   // ← unlocks the side panel (width: 0 → 68px)
                    // Clear any stale biz state from the previous evaluation
                    s.bizOp        = null;
                    s.bizResult    = null;
                    s.bizPct       = "";
                } catch (_) {
                    s.error        = true;
                    s.tokens       = [];
                    s.currentInput = "Error";
                    s.inputPending = false;
                    s.openBrackets = 0;
                    s.justEvaled   = false;
                }
                break;
            }
        }
    }

    // ── History recall ────────────────────────────────────────────────────────

    recallHistory(entry) {
        const s = this.state;
        s.currentInput = entry.result.toString();
        s.inputPending = true;
        s.tokens       = [];
        s.justEvaled   = true;
        s.openBrackets = 0;
        s.error        = false;
        s.bizOp        = null;
        s.bizResult    = null;
        s.bizPct       = "";
    }

    fmtResult(num)   { return fmt(num); }
    formatTime(date) {
        return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    }

    // ── Keyboard ──────────────────────────────────────────────────────────────

    _onKeyDown(ev) {
        const tag      = document.activeElement?.tagName?.toLowerCase();
        const editable = ["input", "textarea", "select"].includes(tag) ||
                         document.activeElement?.isContentEditable;
        if (editable) return;

        const map = {
            "0":"0","1":"1","2":"2","3":"3","4":"4",
            "5":"5","6":"6","7":"7","8":"8","9":"9",
            "+":"+", "-":"-", "*":"×", "/":"÷",
            ".":".", ",":".",
            "Enter":"=", "=":"=",
            "Backspace":"⌫", "Delete":"CE",
        };

        if (this.state.mode === "advanced") {
            if (ev.key === "(") { ev.preventDefault(); this.onButton("("); return; }
            if (ev.key === ")") { ev.preventDefault(); this.onButton(")"); return; }
        }

        if (map[ev.key]) { ev.preventDefault(); this.onButton(map[ev.key]); }
    }

    // ── Drag (targets .sc-wrapper so both panels move as one unit) ────────────

    _onDragStart(ev) {
        const wrapper = ev.currentTarget.closest(".sc-wrapper");
        if (!wrapper) return;
        this._wrapperEl = wrapper;
        const rect      = wrapper.getBoundingClientRect();
        this._drag      = { active: true, startX: ev.clientX, startY: ev.clientY,
                            origX: rect.left, origY: rect.top };
        ev.preventDefault();
    }

    _onMouseMove(ev) {
        if (!this._drag.active || !this._wrapperEl) return;
        const dx   = ev.clientX - this._drag.startX;
        const dy   = ev.clientY - this._drag.startY;
        const newX = Math.max(0, Math.min(window.innerWidth  - this._wrapperEl.offsetWidth,  this._drag.origX + dx));
        const newY = Math.max(0, Math.min(window.innerHeight - this._wrapperEl.offsetHeight, this._drag.origY + dy));
        this._wrapperEl.style.left   = newX + "px";
        this._wrapperEl.style.top    = newY + "px";
        this._wrapperEl.style.right  = "auto";
        this._wrapperEl.style.bottom = "auto";
    }

    _onMouseUp() { this._drag.active = false; }

    // ═══════════════════════════════════════════════════════════════════════════
    // PHASE 3 — Business operations
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * Activate a business op.
     *
     * Side panel width progression:
     *   justEvaled=true  → sc-biz-side-open     (68px,  icon col slides in)
     *   bizOp set        → sc-biz-side-expanded  (240px, expand area slides in)
     *
     * Clicking the active op again collapses the expand area back to icon-only
     * (bizOp → null, width 240px → 68px).
     *
     * JS guard: side panel buttons are CSS-hidden when justEvaled=false, but
     * this guard protects against any programmatic calls.
     */
    activateBizOp(op) {
        if (!this.state.justEvaled) return;

        // Toggle off (collapse expand area back to icon col)
        if (this.state.bizOp === op) {
            this.state.bizOp     = null;
            this.state.bizResult = null;
            this.state.bizPct    = "";
            return;
        }

        this.state.bizOp     = op;
        this.state.bizPct    = "";
        this.state.bizResult = null;

        if (op === "tax") {
            this._loadTaxesIfNeeded();
        }
    }

    /** Close the expand area (width 240 → 68). Calc state unchanged. */
    cancelBizOp() {
        this.state.bizOp     = null;
        this.state.bizPct    = "";
        this.state.bizResult = null;
    }

    onBizPctInput(value) {
        this.state.bizPct    = value;
        this.state.bizResult = null;   // clear stale result while user is editing
    }

    /**
     * Enter key in the % input.
     * Logic lives here (not inline in t-on-keydown) because OWL v2's template
     * compiler rejects { after a condition inside arrow functions.
     */
    onPctKeydown(ev) {
        if (ev.key === "Enter") {
            ev.preventDefault();
            this.applyBizOp();
        }
    }

    onLandedInput(field, value) {
        this.state.bizLanded[field] = value;
        this.state.bizResult        = null;
    }

    /** Apply the active biz op (markup / margin / discount / landed). */
    applyBizOp() {
        const base = this.bizBase;
        const op   = this.state.bizOp;

        if (!base || isNaN(base)) {
            this.state.bizResult = { error: "No valid base value on display" };
            return;
        }

        try {
            if (op === "markup") {
                const pct = parseFloat(this.state.bizPct);
                if (isNaN(pct) || pct < 0) throw new Error("Enter a valid markup %");
                const profit    = base * pct / 100;
                const salePrice = base + profit;
                this._commit([
                    { label: "Cost",                        value: fmtMoney(base)            },
                    { label: `Markup (${fmtMoney(pct)}%)`, value: "+" + fmtMoney(profit)    },
                    { label: "Sale Price",                  value: fmtMoney(salePrice)        },
                ], salePrice);

            } else if (op === "margin") {
                const pct = parseFloat(this.state.bizPct);
                if (isNaN(pct) || pct < 0 || pct >= 100)
                    throw new Error("Margin must be 0–99%");
                const salePrice = base / (1 - pct / 100);
                const profit    = salePrice - base;
                this._commit([
                    { label: "Cost",                               value: fmtMoney(base)         },
                    { label: `Profit (${fmtMoney(pct)}% margin)`, value: "+" + fmtMoney(profit) },
                    { label: "Sale Price",                         value: fmtMoney(salePrice)    },
                ], salePrice);

            } else if (op === "discount") {
                const pct = parseFloat(this.state.bizPct);
                if (isNaN(pct) || pct < 0 || pct > 100)
                    throw new Error("Discount must be 0–100%");
                const saving = base * pct / 100;
                const final_ = base - saving;
                this._commit([
                    { label: "Original",                     value: fmtMoney(base)          },
                    { label: `Disc (${fmtMoney(pct)}%)`,    value: "-" + fmtMoney(saving)  },
                    { label: "Final Price",                  value: fmtMoney(final_)         },
                ], final_);

            } else if (op === "landed") {
                const freight  = parseFloat(this.state.bizLanded.freight) || 0;
                const duties   = parseFloat(this.state.bizLanded.duties)  || 0;
                const other    = parseFloat(this.state.bizLanded.other)   || 0;
                const overhead = freight + duties + other;
                const total    = base + overhead;
                const pct      = base > 0 ? (overhead / base) * 100 : 0;
                this._commit([
                    { label: "Product Cost",                 value: fmtMoney(base)     },
                    { label: "Freight",                      value: fmtMoney(freight)  },
                    { label: "Duties",                       value: fmtMoney(duties)   },
                    { label: "Other",                        value: fmtMoney(other)    },
                    { label: `Overhead (${fmtMoney(pct)}%)`, value: fmtMoney(overhead) },
                    { label: "Landed Cost",                  value: fmtMoney(total)    },
                ], total);
            }
        } catch (err) {
            this.state.bizResult = { error: err.message };
        }
    }

    /**
     * Apply a tax from the picker (immediate — no separate Apply step).
     * Rate and type come directly from account.tax.
     */
    applyTax(tax) {
        const base = this.bizBase;
        if (!base || isNaN(base)) {
            this.state.bizResult = { error: "No valid base value on display" };
            return;
        }

        let taxAmount = 0;
        if (tax.amount_type === "percent") {
            taxAmount = base * tax.amount / 100;
        } else if (tax.amount_type === "fixed") {
            taxAmount = tax.amount;
        } else {
            this.state.bizResult = { error: `Unsupported tax type: ${tax.amount_type}` };
            return;
        }

        const total    = base + taxAmount;
        const taxLabel = tax.amount_type === "percent"
            ? `${tax.name} (${fmtMoney(tax.amount)}%)`
            : `${tax.name} (fixed)`;

        this._commit([
            { label: "Base Amount", value: fmtMoney(base)            },
            { label: taxLabel,      value: "+" + fmtMoney(taxAmount) },
            { label: "Total",       value: fmtMoney(total)           },
        ], total);
    }

    /**
     * Shared finaliser.
     * Stores the result card (shown in the expand area), updates the calculator
     * display to the new value, and adds a history entry.
     * Keeps justEvaled=true so the user can chain further biz ops without
     * re-pressing =.
     */
    _commit(lines, newValue) {
        const s       = this.state;
        const rounded = Math.round(newValue * 1e10) / 1e10;

        s.bizResult = { lines };

        const histLabel = `${lines[0].label} → ${lines[lines.length - 1].label}`;
        this.props.onAddHistory(histLabel, rounded);

        s.currentInput = rounded.toString();
        s.tokens       = [];
        s.inputPending = false;
        s.openBrackets = 0;
        s.justEvaled   = true;   // side panel stays open for chaining
        s.error        = false;
        // bizOp stays set so the expand area remains visible with the result card
    }

    // ── Tax loading ───────────────────────────────────────────────────────────

    async _loadTaxesIfNeeded() {
        if (this.state.taxesLoading) return;
        this.state.taxesLoading = true;
        const taxes = await this.taxService.loadTaxes();
        if (!this._mounted) return;     // component was unmounted during the await
        this.state.taxes        = taxes;
        this.state.taxesLoading = false;
    }

    reloadTaxes() {
        this.taxService.clearCache();
        this.state.taxes  = [];
        this._loadTaxesIfNeeded();
    }
}

// ─── SmartCalculatorContainer ─────────────────────────────────────────────────

class SmartCalculatorContainer extends Component {
    static template   = "bvs_smart_calculator_pro.SmartCalculatorContainer";
    static components = { SmartCalculatorPanel };

    setup() {
        this.state = useState({
            visible: false,
            history: [],
        });

        this._boundKey = this._onKeyDown.bind(this);
        onMounted(()     => document.addEventListener("keydown", this._boundKey));
        onWillUnmount(() => document.removeEventListener("keydown", this._boundKey));
    }

    _onKeyDown(ev) {
        const tag      = document.activeElement?.tagName?.toLowerCase();
        const editable = ["input", "textarea", "select"].includes(tag) ||
                         document.activeElement?.isContentEditable;
        if (editable) return;

        if (ev.key === "`") {
            ev.preventDefault();
            this.state.visible = !this.state.visible;
        }
        if (ev.key === "Escape" && this.state.visible) {
            ev.preventDefault();
            this.state.visible = false;
        }
    }

    hideOnly()      { this.state.visible = false; }
    closeAndClear() { this.state.visible = false; this.state.history = []; }

    addToHistory(expression, result) {
        const entry        = { expression, result, timestamp: new Date() };
        this.state.history = [entry, ...this.state.history].slice(0, 10);
    }
}

registry.category("main_components").add("SmartCalculatorContainer", {
    Component: SmartCalculatorContainer,
});