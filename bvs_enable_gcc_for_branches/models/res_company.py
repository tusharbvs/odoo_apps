# -*- coding: utf-8 -*-
from odoo import models


class ResCompany(models.Model):
    _inherit = 'res.company'

    def write(self, vals):
        res = super(ResCompany, self).write(vals)
        if vals.get("l10n_gcc_dual_language_invoice",False):
            for company in self:
                for branch in company.child_ids:
                    branch.l10n_gcc_dual_language_invoice = vals["l10n_gcc_dual_language_invoice"]
        return res
    