/** @odoo-module **/

/**
 * Smart Calculator - Service layer
 *
 * Phase 1 & 2: All keyboard handling and panel visibility logic lives directly
 * inside SmartCalculatorContainer (smart_calculator_component.js).
 * No separate service registration is needed for Phase 1 or Phase 2.
 *
 * Phase 3 (upcoming): This file will register an Odoo service that exposes:
 *   - Live tax rates pulled from account.tax
 *   - Currency-aware formatting
 *   - Margin / discount / landed-cost calculation helpers
 *
 * Leave this file in place - it is declared in __manifest__.py assets and
 * its absence would cause a 404 in the asset bundle.
 */