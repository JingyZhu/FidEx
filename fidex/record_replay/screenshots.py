"""
Not run in venv
"""
import json
import sys
sys.path.append('../')
from baseline import pixel_diff
import cv2
import os

metadata = 'carta_test_metadata.json'
prefix = '../../fidelity-files/writes/fidelity_check'

def comp_onload_screenshots():
    data = json.load(open(metadata, 'r'))
    onload_simi = []
    for i, ei in enumerate(data.values()):
        dirr = ei['directory']
        print(i, dirr)
        if not os.path.exists(f'./{prefix}/{dirr}/live.png') or not os.path.exists(f'./{prefix}/{dirr}/archive.png'):
            continue
        live_img = f'./{prefix}/{dirr}/live.png'
        archive_img = f'./{prefix}/{dirr}/archive.png' 
        simi, img_diff = pixel_diff.diff(live_img, archive_img, return_diff_img=True)
        cv2.imwrite(f'./{prefix}/{dirr}/diff_load_{simi:.2f}.png', img_diff)
        count = 0
        while True:
            if not os.path.exists(f'./{prefix}/{dirr}/live_{count}.png') or not os.path.exists(f'./{prefix}/{dirr}/archive_{count}.png'):
                break
            live_img = f'./{prefix}/{dirr}/live_{count}.png'
            archive_img = f'./{prefix}/{dirr}/archive_{count}.png'
            simi, img_diff = pixel_diff.diff(live_img, archive_img, return_diff_img=True)
            cv2.imwrite(f'./{prefix}/{dirr}/diff_{count}_{simi:.2f}.png', img_diff)
            count += 1

comp_onload_screenshots()