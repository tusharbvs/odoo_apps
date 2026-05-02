# -*- coding: utf-8 -*-
# Copyright 2026-27 BitVoyage Solution <tusharwork89@gmail.com>
{
    'name': 'Smart Calculator Pro',
    'version': '19.0.2.0.0',
    'category': 'Productivity',
    'summary': 'Advanced & business calculator — Adv edition plus tax-aware tools',
    'description': """
        Builds on Smart Calculator Adv with an enhanced UI and a backend service
        for tax-aware calculations integrated with Accounting where configured.
    """,
    'author': 'BitVoyage Solution',
    'website': 'tusharwork89@gmail.com',
    'depends': ['bvs_smart_calculator_adv', 'web', 'account'],
    'assets': {
        'web.assets_backend': [
            ('remove', 'bvs_smart_calculator_adv/static/src/css/smart_calculator.css'),
            ('remove', 'bvs_smart_calculator_adv/static/src/xml/smart_calculator.xml'),
            ('remove', 'bvs_smart_calculator_adv/static/src/js/smart_calculator_component.js'),
            ('remove', 'bvs_smart_calculator_adv/static/src/js/smart_calculator_service.js'),
            'bvs_smart_calculator_pro/static/src/css/smart_calculator.css',
            'bvs_smart_calculator_pro/static/src/xml/smart_calculator.xml',
            'bvs_smart_calculator_pro/static/src/js/smart_calculator_component.js',
            'bvs_smart_calculator_pro/static/src/js/smart_calculator_service.js',
        ],
    },
    'installable': True,
    'auto_install': False,
    'application': False,
    'license': 'OPL-1',
    'images': ['static/description/banner.png'],
    "price": 30.00,
    "currency": "USD",
}
