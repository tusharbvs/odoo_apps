/** @odoo-module **/

/**
 * bvs_smart_calculator_tax  - Odoo service (Phase 3)
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Loads active taxes from account.tax via JSON-RPC and caches the result
 * for the lifetime of the page session.  The ↺ (reload) button in the tax
 * picker calls clearCache() to force a fresh fetch on the next open.
 *
 * Deliberately avoids the "company" service which is not guaranteed to be
 * registered in every Odoo CE deployment context.
 *
 * Field contract expected by SmartCalculatorPanel:
 *   { id, name, amount, amount_type, type_tax_use }
 *
 * amount_type values handled:
 *   "percent" - taxAmount = base × amount / 100
 *   "fixed"   - taxAmount = amount  (flat fee)
 *   others    - the UI shows an "unsupported" error message
 *
 * type_tax_use values used for colour-coding in the picker:
 *   "sale"     → green tint
 *   "purchase" → blue tint
 */

import { registry } from "@web/core/registry";
import { rpc }      from "@web/core/network/rpc";

const smartCalculatorTaxService = {
    dependencies: [],

    async start() {
        let _cache   = null;   // null = not yet loaded; [] = loaded but empty / errored
        let _loading = false;

        /**
         * loadTaxes()
         * Returns the cached array on repeat calls.
         * Concurrent callers while a fetch is in-flight get [] immediately
         * (the component will show the spinner until the first caller resolves
         * and the state update re-renders).
         *
         * @returns {Promise<Array<{id, name, amount, amount_type, type_tax_use}>>}
         */
        async function loadTaxes() {
            if (_cache !== null) return _cache;
            if (_loading)        return [];

            _loading = true;
            try {
                const taxes = await rpc("/web/dataset/call_kw", {
                    model:  "account.tax",
                    method: "search_read",
                    args: [[
                        ["active",       "=", true],
                        ["type_tax_use", "in", ["sale", "purchase"]],
                    ]],
                    kwargs: {
                        fields: ["id", "name", "amount", "amount_type", "type_tax_use"],
                        order:  "sequence asc, name asc",
                        limit:  24,     // keeps the picker grid manageable
                    },
                });

                _cache   = taxes;
                _loading = false;
                return taxes;

            } catch (err) {
                // Log but don't crash - the picker will show "No active taxes found."
                console.warn("[SmartCalc] Tax RPC failed:", err);
                _loading = false;
                _cache   = [];   // cache empty result so we don't hammer on repeated errors
                return [];
            }
        }

        /**
         * clearCache()
         * Drops the cached result so the next loadTaxes() call fetches fresh
         * data from the server.  Called by the ↺ button in the tax picker.
         */
        function clearCache() {
            _cache   = null;
            _loading = false;
        }

        return { loadTaxes, clearCache };
    },
};

registry.category("services").add("bvs_smart_calculator_tax", smartCalculatorTaxService);