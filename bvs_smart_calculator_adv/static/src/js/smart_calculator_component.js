/** @odoo-module **/

import { Component, useState, onMounted, onWillUnmount } from "@odoo/owl";
import { registry } from "@web/core/registry";

// ─── Pure helpers ─────────────────────────────────────────────────────────────

/**
 * Token-array expression evaluator.
 * Normalises display characters (×→* ÷→/ -→-) then evaluates via Function.
 * Character whitelist guards against injection.
 */
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

/** Format number with thousands separator and up to 10 decimal places. */
function fmt(num, trailingDot = false) {
    const rounded = Math.round(Number(num) * 1e10) / 1e10;
    const [int, dec] = rounded.toString().split(".");
    const intFmt = Number(int).toLocaleString("en-US");
    const result = dec !== undefined ? intFmt + "." + dec : intFmt;
    return trailingDot ? result + "." : result;
}

// ─── Mode definitions ─────────────────────────────────────────────────────────

const MODES = [
    { key: "basic", label: "Basic", disabled: false },
    { key: "advanced", label: "Advanced", disabled: false },
];

// ─── SmartCalculatorPanel ─────────────────────────────────────────────────────
// MUST be defined before SmartCalculatorContainer — OWL class references are
// not hoisted.  Defining Container first causes ReferenceError at runtime.

class SmartCalculatorPanel extends Component {
    static template = "bvs_smart_calculator_adv.SmartCalculatorPanel";
    static props = {
        history:      { type: Array },
        onAddHistory: { type: Function },
        onHide:       { type: Function },
        onClose:      { type: Function },
    };

    setup() {
        this.state = useState({
            // ── Mode ─────────────────────────────────────────────────────────
            mode: "basic",        // "basic" | "advanced"

            // ── Expression model ─────────────────────────────────────────────
            // tokens      : committed tokens e.g. ["(", "3", "+", "5", ")","×"]
            // currentInput: digits the user is actively typing
            // inputPending: true only when user has typed at least one digit
            tokens:       [],
            currentInput: "0",
            inputPending: false,

            // ── Memory ───────────────────────────────────────────────────────
            memory:    0,
            hasMemory: false,

            // ── Misc ─────────────────────────────────────────────────────────
            justEvaled:   false,  // true immediately after = was pressed
            openBrackets: 0,
            error:        false,
        });

        // Drag state — direct mutation (NOT useState) so dragging never triggers
        // OWL re-renders.  Gives smooth 60 fps movement.
        this._drag    = { active: false, startX: 0, startY: 0, origX: 0, origY: 0 };
        this._panelEl = null;

        onMounted(() => {
            this._onMM  = this._onMouseMove.bind(this);
            this._onMU  = this._onMouseUp.bind(this);
            this._onKey = this._onKeyDown.bind(this);
            document.addEventListener("mousemove", this._onMM);
            document.addEventListener("mouseup",   this._onMU);
            document.addEventListener("keydown",   this._onKey);
        });

        onWillUnmount(() => {
            document.removeEventListener("mousemove", this._onMM);
            document.removeEventListener("mouseup",   this._onMU);
            document.removeEventListener("keydown",   this._onKey);
        });
    }

    // ── Mode switching ────────────────────────────────────────────────────────

    switchMode(key) {
        const mode = MODES.find(m => m.key === key);
        if (!mode || mode.disabled) return;
        this.state.mode = key;
        // Reset calculator state when switching modes so the display is clean.
        // History stays (it lives in Container, not here).
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
    }

    // ── Template-facing computed values ──────────────────────────────────────

    get displayExpression() { return this.state.tokens.join(" "); }

    get displayValue() {
        if (this.state.error) return "Error";
        if (!this.state.inputPending) return "0";
        const raw         = this.state.currentInput;
        const trailingDot = raw.endsWith(".");
        const n           = parseFloat(raw);
        return isNaN(n) ? raw : fmt(n, trailingDot);
    }

    get memDisplay()       { return this.state.hasMemory ? "M = " + fmt(this.state.memory) : ""; }
    get bracketIndicator() { return "(".repeat(this.state.openBrackets); }

    // ── Main button handler ───────────────────────────────────────────────────

    onButton(value) {
        const s        = this.state;
        const OPERATORS = ["+", "-", "×", "÷"];
        const isOp      = v => OPERATORS.includes(v);
        const lastTok   = () => s.tokens.length ? s.tokens[s.tokens.length - 1] : null;

        if (s.error && value !== "C") s.error = false;

        switch (value) {

            // ── Clear / Delete ────────────────────────────────────────────────
            case "C":
                this._resetCalc();
                break;

            case "CE":
                s.currentInput = "0";
                s.inputPending = false;
                s.error        = false;
                break;

            case "⌫":
                if (s.justEvaled) {
                    s.currentInput = "0"; s.inputPending = false; s.justEvaled = false;
                } else if (s.inputPending && s.currentInput.length > 1) {
                    s.currentInput = s.currentInput.slice(0, -1);
                    if (s.currentInput === "-") { s.currentInput = "0"; s.inputPending = false; }
                } else {
                    s.currentInput = "0"; s.inputPending = false;
                }
                break;

            // ── Digits ────────────────────────────────────────────────────────
            case "0": case "1": case "2": case "3": case "4":
            case "5": case "6": case "7": case "8": case "9":
                if (s.justEvaled) {
                    s.tokens = []; s.openBrackets = 0;
                    s.currentInput = value; s.inputPending = true; s.justEvaled = false;
                } else if (!s.inputPending) {
                    s.currentInput = value; s.inputPending = true;
                } else {
                    const digits = s.currentInput.replace(/[^0-9]/g, "").length;
                    if (digits < 15) s.currentInput += value;
                }
                break;

            // ── Decimal ───────────────────────────────────────────────────────
            case ".":
                if (s.justEvaled) {
                    s.tokens = []; s.openBrackets = 0;
                    s.currentInput = "0."; s.inputPending = true; s.justEvaled = false;
                } else if (!s.inputPending) {
                    s.currentInput = "0."; s.inputPending = true;
                } else if (!s.currentInput.includes(".")) {
                    s.currentInput += ".";
                }
                break;

            // ── Operators ─────────────────────────────────────────────────────
            case "+": case "-": case "×": case "÷": {
                const lt = lastTok();
                if (s.justEvaled) {
                    s.tokens = [s.currentInput, value];
                    s.currentInput = "0"; s.inputPending = false; s.justEvaled = false;
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

            // ── Brackets (advanced mode only) ─────────────────────────────────
            case "(": {
                s.justEvaled   = false;
                const lt       = lastTok();
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

            // ── Sign toggle ───────────────────────────────────────────────────
            case "±":
                if ((!s.inputPending && !s.justEvaled) || s.currentInput === "0") break;
                s.currentInput = s.currentInput.startsWith("-")
                    ? s.currentInput.slice(1)
                    : "-" + s.currentInput;
                break;

            // ── Percentage ────────────────────────────────────────────────────
            case "%": {
                if (!s.inputPending && !s.justEvaled) break;
                const pct = parseFloat(s.currentInput) / 100;
                s.currentInput = (Math.round(pct * 1e10) / 1e10).toString();
                s.inputPending = true;
                break;
            }

            // ── Memory ────────────────────────────────────────────────────────
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

            // ── Equals ────────────────────────────────────────────────────────
            case "=": {
                try {
                    let evalToks = [...s.tokens];
                    const lt     = lastTok();
                    if (s.inputPending)      evalToks.push(s.currentInput);
                    else if (isOp(lt))       evalToks.push(s.currentInput);
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
                    s.justEvaled   = true;
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
    }

    // ── Template helpers ──────────────────────────────────────────────────────

    fmtResult(num)  { return fmt(num); }
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

        // Bracket keyboard shortcuts only in advanced mode
        if (this.state.mode === "advanced") {
            if (ev.key === "(") { ev.preventDefault(); this.onButton("("); return; }
            if (ev.key === ")") { ev.preventDefault(); this.onButton(")"); return; }
        }

        if (map[ev.key]) { ev.preventDefault(); this.onButton(map[ev.key]); }
    }

    // ── Drag ──────────────────────────────────────────────────────────────────

    _onDragStart(ev) {
        const panel = ev.currentTarget.closest(".sc-panel");
        if (!panel) return;
        this._panelEl = panel;
        const rect    = panel.getBoundingClientRect();
        this._drag    = { active: true, startX: ev.clientX, startY: ev.clientY,
                          origX: rect.left, origY: rect.top };
        ev.preventDefault();
    }

    _onMouseMove(ev) {
        if (!this._drag.active || !this._panelEl) return;
        const dx   = ev.clientX - this._drag.startX;
        const dy   = ev.clientY - this._drag.startY;
        const newX = Math.max(0, Math.min(window.innerWidth  - this._panelEl.offsetWidth,  this._drag.origX + dx));
        const newY = Math.max(0, Math.min(window.innerHeight - this._panelEl.offsetHeight, this._drag.origY + dy));
        this._panelEl.style.left   = newX + "px";
        this._panelEl.style.top    = newY + "px";
        this._panelEl.style.right  = "auto";
        this._panelEl.style.bottom = "auto";
    }

    _onMouseUp() { this._drag.active = false; }
}

// ─── SmartCalculatorContainer ─────────────────────────────────────────────────

class SmartCalculatorContainer extends Component {
    static template   = "bvs_smart_calculator_adv.SmartCalculatorContainer";
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

    hideOnly()     { this.state.visible = false; }
    closeAndClear() { this.state.visible = false; this.state.history = []; }

    addToHistory(expression, result) {
        const entry        = { expression, result, timestamp: new Date() };
        this.state.history = [entry, ...this.state.history].slice(0, 10);
    }
}

registry.category("main_components").add("SmartCalculatorContainer", {
    Component: SmartCalculatorContainer,
});