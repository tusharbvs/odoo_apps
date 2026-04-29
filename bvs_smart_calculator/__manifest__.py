# -*- coding: utf-8 -*-
# Copyright 2026-27 BitVoyage Solution <tusharwork89@gmail.com>
{
    'name': 'Smart Calculator',
    'version': '1.0.0',
    'category': 'Tools',
    'summary': 'Keyboard-triggered smart calculator for the Odoo backend',
    'description': """
        Press the backtick (`) key from anywhere in the Odoo backend
        to instantly open a floating calculator.
    """,
    'author': 'BitVoyage Solution',
    'website': 'tusharwork89@gmail.com',
    'depends': ['web'],
    'assets': {
        'web.assets_backend': [
            'bvs_smart_calculator/static/src/css/smart_calculator.css',
            'bvs_smart_calculator/static/src/xml/smart_calculator.xml',
            'bvs_smart_calculator/static/src/js/smart_calculator_component.js',
            'bvs_smart_calculator/static/src/js/smart_calculator_service.js',
        ],
    },
    'installable': True,
    'auto_install': False,
    'application': False,
    'license': 'LGPL-3',
    'images': ['static/description/banner.png'],
}
