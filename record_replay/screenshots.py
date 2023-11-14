"""
Not run in venv
"""
import json
import sys
sys.path.append('../')
from baseline import pixel_diff, exception_failfetch
from subprocess import call
import cv2
import re
import os

metadata = 'eot-writes_metadata.json'
prefix = 'writes'

def comp_onload_screenshots():
    data = json.load(open(metadata, 'r'))
    onload_simi = []
    for i, ei in enumerate(data.values()):
        dirr = ei['directory']
        print(i, dirr)
        if not os.path.exists(f'./{prefix}/{dirr}/live.png') or not os.path.exists(f'./{prefix}/{dirr}/archive.png'):
            continue
        call(['mkdir', '-p', f'./screenshots/{dirr}/'])
        # * Onload
        live_img = f'./{prefix}/{dirr}/live.png'
        archive_img = f'./{prefix}/{dirr}/archive.png' 
        call(['cp', live_img, f'./screenshots/{dirr}/0_live.png'])
        call(['cp', archive_img, f'./screenshots/{dirr}/0_archive.png'])
        img_simi = pixel_diff.diff(live_img, archive_img, return_diff_img=True)
        onload_simi.append({
            'directory': dirr,
            'screenshot_similarity': img_simi[0]
        })
        json.dump(onload_simi, open('./screenshots/onload_screenshot_similarity.json', 'w+'), indent=2)
        cv2.imwrite(f'./screenshots/{dirr}/0_diff_{img_simi[0]:.2f}.png', img_simi[1])
    

comp_onload_screenshots()