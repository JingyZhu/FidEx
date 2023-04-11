"""
"event_info.json" needs to be ready before running the script 
    refer to: recording.ipynb --> "See how many interactions can be matched between record and replay"
"""
import json
import sys
sys.path.append('../')
from baseline import pixel_diff, exception_failfetch
from subprocess import call
import cv2
import re
import os

events_info = json.load(open('events_info.json', 'r'))
# directory = 'canadianart.ca_1'
# target_events_info = [ei for ei in events_info if ei['directory'] == directory]
metadata = 'eot_metadata.json'

def comp_all_screenshots():
    target_events_info = [e for e in events_info if e['directory'] != '2022.vbexhibitions.hk_1']
    for i, ei in enumerate(target_events_info):
        dirr = ei['directory']
        print(i, dirr)
        call(['mkdir', '-p', f'./screenshot_diff/{dirr}/'])
        # * Onload
        live_img = f'./pageinfo/{dirr}/dimension.png'
        archive_img = f'./pageinfo/{dirr}_archive/dimension.png' 
        call(['cp', live_img, f'./screenshot_diff/{dirr}/0_live.png'])
        call(['cp', archive_img, f'./screenshot_diff/{dirr}/0_archive.png'])
        img_simi = pixel_diff.diff(live_img, archive_img, return_diff_img=True)
        cv2.imwrite(f'./screenshot_diff/{dirr}/0_diff_{img_simi[0]:.2f}.png', img_simi[1])
        intersect_elements = ei['intersect_elements']
        for j, event in enumerate(intersect_elements):
            print(j, len(intersect_elements))
            live_img = f'./pageinfo/{event["live_screenshot"]}'
            archive_img = f'./pageinfo/{event["archive_screenshot"]}'
            live_idx = re.compile('.*dimension_(\d+).png').match(event['live_screenshot']).group(1)
            archive_idx = re.compile('.*dimension_(\d+).png').match(event['archive_screenshot']).group(1)
            call(['cp', live_img, f'./screenshot_diff/{dirr}/{j+1}_live_{live_idx}.png'])
            call(['cp', archive_img, f'./screenshot_diff/{dirr}/{j+1}_archive_{archive_idx}_archive.png'])
            img_simi = pixel_diff.diff(live_img, archive_img, return_diff_img=True)
            cv2.imwrite(f'./screenshot_diff/{dirr}/{j+1}_diff_{img_simi[0]:.2f}.png', img_simi[1])

def comp_onload_screenshots():
    data = json.load(open(metadata, 'r'))
    onload_simi = []
    for i, ei in enumerate(data.values()):
        dirr = ei['directory']
        print(i, dirr)
        if not os.path.exists(f'./pageinfo/{dirr}/live_dimension.png') or not os.path.exists(f'./pageinfo/{dirr}/archive_dimension.png'):
            continue
        call(['mkdir', '-p', f'./screenshot_diff/{dirr}/'])
        # * Onload
        live_img = f'./pageinfo/{dirr}/live_dimension.png'
        archive_img = f'./pageinfo/{dirr}/archive_dimension.png' 
        call(['cp', live_img, f'./screenshot_diff/{dirr}/0_live.png'])
        call(['cp', archive_img, f'./screenshot_diff/{dirr}/0_archive.png'])
        img_simi = pixel_diff.diff(live_img, archive_img, return_diff_img=True)
        onload_simi.append({
            'directory': dirr,
            'screenshot_similarity': img_simi[0]
        })
        json.dump(onload_simi, open('./screenshot_diff/onload_screenshot_similarity.json', 'w+'), indent=2)
        cv2.imwrite(f'./screenshot_diff/{dirr}/0_diff_{img_simi[0]:.2f}.png', img_simi[1])


def main():
    target_events_info = events_info
    results = []
    for i, ei in enumerate(target_events_info):
        dirr = ei['directory']
        print(i, dirr)
        # * Onload
        live_img = f'./pageinfo/{dirr}/dimension.png'
        archive_img = f'./pageinfo/{dirr}_archive/dimension.png' 
        img_simi = pixel_diff.diff(live_img, archive_img)
        live_obj = json.load(open(f'./pageinfo/{dirr}_archive/exception_failfetch_record.json', 'r'))[0]
        archive_obj = json.load(open(f'./pageinfo/{dirr}_archive/exception_failfetch.json', 'r'))[0]
        live_excep, live_ff = exception_failfetch.num_exceptions_failedfetches(live_obj)
        archive_excep, archive_ff = exception_failfetch.num_exceptions_failedfetches(archive_obj)
        onload = {
            'screenshot_similarity': img_simi,
            'archive_delta_exception': archive_excep - live_excep,
            'archive_delta_failfetch': len(archive_ff) - len(live_ff),
        } 
        # * Interaction
        intersect_elements = ei['intersect_elements']
        baseline = []
        for j, event in enumerate(intersect_elements):
            print(j, len(intersect_elements))
            live_img = f'./pageinfo/{event["live_screenshot"]}'
            archive_img = f'./pageinfo/{event["archive_screenshot"]}'
            img_simi = pixel_diff.diff(live_img, archive_img)
            live_excep, live_ff = exception_failfetch.num_exceptions_failedfetches(event['live_excep_ff'])
            archive_excep, archive_ff = exception_failfetch.num_exceptions_failedfetches(event['archive_excep_ff'])
            baseline.append({
                'path': event['path'],
                'screenshot_similarity': img_simi,
                'archive_delta_exception': archive_excep - live_excep,
                'archive_delta_failfetch': len(archive_ff) - len(live_ff),
                'live_img': live_img,
                'archive_img': archive_img
            })
        results.append({
            'directory': dirr,
            'onload': onload,
            'baseline': baseline
        })
        json.dump(results, open('interaction_results.json', 'w+'), indent=2)
    # json.dump(results, open('interaction_results.json', 'w+'), indent=2)

comp_onload_screenshots()