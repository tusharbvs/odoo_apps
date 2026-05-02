# -*- coding: utf-8 -*-
# Copyright 2026-27 BitVoyage Solution <tusharwork89@gmail.com>
{
    'name': 'Smart Calculator Advanced',
    'version': '19.0.2.0.0',
    'category': 'Tools',
    'summary': 'Advanced calculator with brackets, memory & history timestamps',
    'description': """
        Extends Smart Calculator with Basic / Advanced modes, bracket-aware
        evaluation, memory keys (MC/MR/M+/M-), and a timestamped history tape.
    """,
    'author': 'BitVoyage Solution',
    'website': 'tusharwork89@gmail.com',
    'depends': ['bvs_smart_calculator', 'web'],
    'assets': {
        'web.assets_backend': [
            ('remove', 'bvs_smart_calculator/static/src/css/smart_calculator.css'),
            ('remove', 'bvs_smart_calculator/static/src/xml/smart_calculator.xml'),
            ('remove', 'bvs_smart_calculator/static/src/js/smart_calculator_component.js'),
            ('remove', 'bvs_smart_calculator/static/src/js/smart_calculator_service.js'),
            'bvs_smart_calculator_adv/static/src/css/smart_calculator.css',
            'bvs_smart_calculator_adv/static/src/xml/smart_calculator.xml',
            'bvs_smart_calculator_adv/static/src/js/smart_calculator_component.js',
            'bvs_smart_calculator_adv/static/src/js/smart_calculator_service.js',
        ],
    },
    'installable': True,
    'auto_install': False,
    'application': False,
    'license': 'LGPL-3',
    'images': ['static/description/banner.png'],
}
