# -*- coding: utf-8 -*-
from odoo import models

class IrModuleModule(models.Model):
    _inherit = 'ir.module.module'

    def action_multi_module_uninstall(self):
        """Uninstall multiple modules selected in the list view."""
        if self.env.context.get('active_ids',[]):
            modules = self.browse(self._context.get('active_ids',[]))
            for module in modules:
                if module.state in ['installed']:
                    module.button_immediate_uninstall()