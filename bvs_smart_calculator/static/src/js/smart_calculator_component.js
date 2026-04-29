/** @odoo-module **/

import { Component, useState, onMounted, onWillUnmount, useRef } from "@odoo/owl";
import { registry } from "@web/core/registry";

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENT 1 - SmartCalculatorPanel
// Defined FIRST (Container references it below).
//
// History is NO LONGER owned here - it lives in the Container so it
// survives hide/show cycles.
// Panel receives history and history helpers via props.
// ═════════════════════════════════════════════════════════════════════════════

class SmartCalculatorPanel extends Component {
    static template   = "bvs_smart_calculator.SmartCalculatorPanel";
    static components = {};
    static props      = {
        hideOnly:       Function,   // Esc / ` → hide but keep history
        closeAndClear:  Function,   // ✕ button → hide and wipe history
        history:        Array,      // Owned by Container, passed down
        addToHistory:   Function,   // Container's method to push a new entry
        clearHistory:   Function,   // Container's method to wipe history
    };

    setup() {
        this.state = useState({
            displayValue:     "0",
            expression:       "",
            firstOperand:     null,
            operator:         null,
            waitingForSecond: false,
            hasError:         false,
            // history lives in Container now - not here
        });

        this.panelRef    = useRef("panel");
        this._drag       = null;
        this._onKeyDown  = this._onKeyDown.bind(this);
        this._onDragMove = this._onDragMove.bind(this);
        this._onDragEnd  = this._onDragEnd.bind(this);

        onMounted(() => {
            document.addEventListener("keydown", this._onKeyDown);
            requestAnimationFrame(() => {
                this.panelRef.el?.classList.add("sc-panel--visible");
            });
        });

        onWillUnmount(() => {
            document.removeEventListener("keydown",   this._onKeyDown);
            document.removeEventListener("mousemove", this._onDragMove);
            document.removeEventListener("mouseup",   this._onDragEnd);
        });
    }

    // ── Drag ──

    _onDragStart(event) {
        if (event.button !== 0) return;
        if (event.target.closest(".sc-close-btn")) return;
        const rect = this.panelRef.el.getBoundingClientRect();
        this._drag = {
            startMouseX: event.clientX, startMouseY: event.clientY,
            startElemX:  rect.left,     startElemY:  rect.top,
        };
        document.addEventListener("mousemove", this._onDragMove);
        document.addEventListener("mouseup",   this._onDragEnd);
        event.preventDefault();
    }

    _onDragMove(event) {
        if (!this._drag) return;
        const el   = this.panelRef.el;
        const newX = this._drag.startElemX + (event.clientX - this._drag.startMouseX);
        const newY = this._drag.startElemY + (event.clientY - this._drag.startMouseY);
        const maxX = window.innerWidth  - el.offsetWidth;
        const maxY = window.innerHeight - el.offsetHeight;
        el.style.left      = `${Math.max(0, Math.min(newX, maxX))}px`;
        el.style.top       = `${Math.max(0, Math.min(newY, maxY))}px`;
        el.style.right     = "auto";
        el.style.bottom    = "auto";
        el.style.transform = "none";
    }

    _onDragEnd() {
        this._drag = null;
        document.removeEventListener("mousemove", this._onDragMove);
        document.removeEventListener("mouseup",   this._onDragEnd);
    }

    // ── Keyboard ──

    _onKeyDown(event) {
        const key = event.key;

        // ` and Esc → hide only (keep history)
        if (key === "`")      { event.preventDefault(); this.props.hideOnly(); return; }
        if (key === "Escape") { this.props.hideOnly(); return; }

        if (key >= "0" && key <= "9") { event.preventDefault(); this.inputDigit(key); return; }

        const map = {
            ".":         () => this.inputDecimal(),
            "+":         () => this.inputOperator("+"),
            "-":         () => this.inputOperator("-"),
            "*":         () => this.inputOperator("×"),
            "/":         () => this.inputOperator("÷"),
            "Enter":     () => this.calculate(),
            "=":         () => this.calculate(),
            "Delete":    () => this.clearEntry(),
            "Backspace": () => this.backspace(),
            "c":         () => this.clear(),
            "C":         () => this.clear(),
        };
        if (map[key]) { event.preventDefault(); map[key](); }
    }

    // ── Calculator logic ──

    inputDigit(digit) {
        if (this.state.hasError) this.clear();
        if (this.state.waitingForSecond) {
            this.state.displayValue     = digit;
            this.state.waitingForSecond = false;
        } else {
            this.state.displayValue =
                this.state.displayValue === "0" ? digit : this.state.displayValue + digit;
        }
    }

    inputDecimal() {
        if (this.state.hasError) return;
        if (this.state.waitingForSecond) {
            this.state.displayValue     = "0.";
            this.state.waitingForSecond = false;
            return;
        }
        if (!this.state.displayValue.includes(".")) this.state.displayValue += ".";
    }

    inputOperator(operator) {
        if (this.state.hasError) return;
        const current = parseFloat(this.state.displayValue);
        if (this.state.operator && !this.state.waitingForSecond) {
            const result = this._compute(this.state.firstOperand, current, this.state.operator);
            if (result === null) return this._setError("Cannot divide by zero");
            this.state.firstOperand = result;
            this.state.displayValue = this._fmt(result);
        } else {
            this.state.firstOperand = current;
        }
        this.state.operator         = operator;
        this.state.waitingForSecond = true;
        this.state.expression       = `${this._fmt(this.state.firstOperand)} ${operator}`;
    }

    calculate() {
        if (this.state.hasError || !this.state.operator || this.state.waitingForSecond) return;

        const second    = parseFloat(this.state.displayValue);
        const result    = this._compute(this.state.firstOperand, second, this.state.operator);
        if (result === null) return this._setError("Cannot divide by zero");

        const fullExpr  = `${this._fmt(this.state.firstOperand)} ${this.state.operator} ${this._fmt(second)}`;
        const resultStr = this._fmt(result);

        // Push to Container's history (it owns the array)
        this.props.addToHistory({ expr: fullExpr, result: resultStr });

        this.state.expression       = `${fullExpr} =`;
        this.state.displayValue     = resultStr;
        this.state.firstOperand     = null;
        this.state.operator         = null;
        this.state.waitingForSecond = false;
    }

    clearEntry() {
        if (this.state.hasError) { this.clear(); return; }
        this.state.displayValue     = "0";
        this.state.waitingForSecond = false;
    }

    clear() {
        Object.assign(this.state, {
            displayValue: "0", expression: "",
            firstOperand: null, operator: null,
            waitingForSecond: false, hasError: false,
        });
    }

    // Delegates to Container's clearHistory prop
    clearHistory() { this.props.clearHistory(); }

    recallHistory(entry) {
        this.clear();
        this.state.displayValue = entry.result;
        this.state.expression   = `↩ ${entry.expr} =`;
    }

    toggleSign() {
        if (this.state.hasError) return;
        const v = parseFloat(this.state.displayValue);
        if (!isNaN(v) && v !== 0) this.state.displayValue = this._fmt(v * -1);
    }

    percentage() {
        if (this.state.hasError) return;
        const v = parseFloat(this.state.displayValue);
        if (!isNaN(v)) this.state.displayValue = this._fmt(v / 100);
    }

    backspace() {
        if (this.state.hasError) { this.clear(); return; }
        if (this.state.waitingForSecond) return;
        const d = this.state.displayValue;
        this.state.displayValue =
            d.length <= 1 || (d.length === 2 && d.startsWith("-")) ? "0" : d.slice(0, -1);
    }

    _compute(a, b, op) {
        let r;
        switch (op) {
            case "+": r = a + b; break;
            case "-": r = a - b; break;
            case "×": r = a * b; break;
            case "÷": if (b === 0) return null; r = a / b; break;
            default:  return null;
        }
        return Math.round(r * 1e10) / 1e10;
    }

    _fmt(v) {
        if (v === null || v === undefined) return "0";
        const s = String(v);
        if (s.replace(/[^0-9]/g, "").length > 12) return parseFloat(v.toPrecision(10)).toString();
        return s;
    }

    _setError(msg) {
        this.state.hasError     = true;
        this.state.displayValue = "Error";
        this.state.expression   = msg;
    }

    get formattedDisplay() {
        if (this.state.hasError) return this.state.displayValue;
        const raw = this.state.displayValue;
        if (raw.endsWith(".")) return raw;
        const num = parseFloat(raw);
        if (isNaN(num)) return raw;
        const parts = raw.split(".");
        const int   = parseInt(parts[0], 10).toLocaleString("en-US");
        return parts.length > 1 ? `${int}.${parts[1]}` : int;
    }

    get displayClass() {
        if (this.state.hasError)                 return "sc-display sc-display--error";
        if (this.state.displayValue.length > 10) return "sc-display sc-display--small";
        return "sc-display";
    }

    isActiveOperator(op) {
        return this.state.operator === op && this.state.waitingForSecond;
    }
}


// ═════════════════════════════════════════════════════════════════════════════
// COMPONENT 2 - SmartCalculatorContainer
// Defined AFTER SmartCalculatorPanel (fixes "cannot access before init").
//
// Owns BOTH isOpen AND history.
// history survives hide/show because this component never unmounts.
//
// Two close methods:
//   hideOnly()      → Esc / ` key  → isOpen=false, history untouched 
//   closeAndClear() → ✕ button     → isOpen=false, history wiped     
// ═════════════════════════════════════════════════════════════════════════════

class SmartCalculatorContainer extends Component {
    static template   = "bvs_smart_calculator.SmartCalculatorContainer";
    static components = { SmartCalculatorPanel };
    static props      = {};

    setup() {
        this.state = useState({
            isOpen:  false,
            history: [],    // Persists across hide/show cycles
        });

        this._onKeyDown = this._onKeyDown.bind(this);

        onMounted(() => {
            document.addEventListener("keydown", this._onKeyDown);
        });

        onWillUnmount(() => {
            document.removeEventListener("keydown", this._onKeyDown);
        });
    }

    _onKeyDown(event) {
        if (event.key !== "`" || event.ctrlKey || event.altKey || event.metaKey) return;
        const tag = event.target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || event.target.isContentEditable) return;

        event.preventDefault();

        if (this.state.isOpen) {
            // ` while open → hide only, keep history
            this.hideOnly();
        } else {
            this.state.isOpen = true;
        }
    }

    // Esc key or ` while open: hide panel, history survives
    hideOnly() {
        this.state.isOpen = false;
    }

    // ✕ button: hide panel AND wipe history
    closeAndClear() {
        this.state.isOpen  = false;
        this.state.history = [];
    }

    // Called by Panel when a calculation completes
    addToHistory(entry) {
        this.state.history = [entry, ...this.state.history].slice(0, 10);
    }

    // Called by Panel's "Clear" history button
    clearHistory() {
        this.state.history = [];
    }
}

registry.category("main_components").add("SmartCalculatorContainer", {
    Component: SmartCalculatorContainer,
});