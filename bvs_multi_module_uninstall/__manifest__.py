# -*- coding: utf-8 -*-
# Copyright 2025-26 BitVoyage Solution <tusharwork89@gmail.com>
{
    "name": "Multi Module Uninstall",
    "version": "18.0.1.0",
    "category": "Tools",
    "summary": "Uninsall multiple modules at once",
    "description": "This module allows you to uninstall multiple modules at once from Odoo.",
    "author": 'BitVoyage Solution',
    "website": 'tusharwork89@gmail.com',
    "depends": ["base"],
    "data": [
            "data/uninstall_delete_action.xml"
    ],
    "license": "OPL-1",
    "installable": True,
    "auto_install": False,
    "application": True,
    'images': ['static/description/banner.png'],

}
