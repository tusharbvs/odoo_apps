# -*- coding: utf-8 -*-
# Copyright 2025-26 BitVoyage Solution <tusharwork89@gmail.com>
{
    "name": "Website Blog Font Countrol",
    "version": "18.0.1.0",
    "category": "Tools",
    "summary": "Website Blog Font Countrol",
    "description": "Website Blog Font Countrol",
    "author": 'BitVoyage Solution',
    "website": 'tusharwork89@gmail.com',
    "depends": ["base","website","website_blog"],
    "data": [
            "views/website_font_countrol_views.xml"
    ],
    'assets': {
        'web.assets_frontend': [
            'bvs_website_font_countrol/static/src/js/font_size_change.js',
        ]
    },
    "license": "OPL-1",
    "installable": True,
    "auto_install": False,
    "application": True,
    'images': ['static/description/banner.png'],

}
