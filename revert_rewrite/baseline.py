"""
Get the number for base line (screenshot and exceptions)
"""
import glob
import os
import json
import sys
import cv2
import numpy as np
import multiprocessing
from collections import defaultdict

sys.path.append('../')
from fidelity_check import fidelity_detect

write_dir = 'writes_gt/'
gt_dir = '../../fidelity-files/writes/ground_truth/'
frac = [2]


def find_dominant_color(image):
    # Convert image to a smaller size for faster processing
    small_img = cv2.resize(image, (10, 10))
    # Convert to LAB color space for better color clustering
    lab_img = cv2.cvtColor(small_img, cv2.COLOR_BGR2LAB)
    # Reshape the image to be a list of pixels
    pixel_values = lab_img.reshape((-1, 3))
    # Convert to float
    pixel_values = np.float32(pixel_values)

    # Define criteria and apply kmeans clustering
    criteria = (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 100, 0.2)
    _, labels, centers = cv2.kmeans(pixel_values, 1, None, criteria, 10, cv2.KMEANS_RANDOM_CENTERS)
    
    # Convert the dominant color to BGR
    dominant_color = centers[0].astype(np.uint8)
    dominant_color_bgr = cv2.cvtColor(np.array([[dominant_color]]), cv2.COLOR_LAB2BGR)[0][0]
    return dominant_color_bgr

def find_largest_rectangle(image, color):
    # Create a mask for pixels equal to the dominant color
    mask = cv2.inRange(image, color-10, color+10)
    # Find contours in the mask
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    # Find the largest rectangle from the contours
    largest_area = 0
    best_rect = (0, 0, 0, 0)
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        area = w * h
        if area > largest_area:
            largest_area = area
            best_rect = (x, y, w, h)

    return best_rect


def screenshot_writes_label(dirr):
    if not os.path.exists(f'{dirr}/results.json'):
        return
    # * Load
    load_screenshots = glob.glob(f'{dirr}/load_exception_*.png')
    for screenshot in load_screenshots:
        name = os.path.basename(screenshot).split('.')[0]
        diff, _ =  fidelity_detect.fidelity_issue_screenshot(dirr, 'load_initial', name)
        if diff:
            return True
    # * extraInteraction
    if glob.glob(f'{dirr}/extraInteraction_exception_*.png'):
        name = os.path.basename(screenshot).split('.')[0]
        diff, _ =  fidelity_detect.fidelity_issue_screenshot(dirr, 'extraInteraction_initial', name)
        if diff:
            return True
    # * interaction
    count = 0
    while True:
        if not glob.glob(f'{dirr}/interaction_{count}_exception_*.png'):
            break
        name = os.path.basename(screenshot).split('.')[0]
        diff, _ =  fidelity_detect.fidelity_issue_screenshot(dirr, f'interaction_{count}_initial', name)
        if diff:
            return True
        count += 1
    return False

def screenshot_gt_label(dirr):
    if not os.path.exists(f'{dirr}/live.png') or not os.path.exists(f'{dirr}/archive.png'):
        print("No screenshots")
        return False, 1
    diff, simi =  fidelity_detect.fidelity_issue_screenshot(dirr, 'live', 'archive')
    interact_simi = simi
    counter = 0
    while True:
        # if interact_simi < 1:
        #     break
        if not os.path.exists(f'{dirr}/live_{counter}.png') or not os.path.exists(f'{dirr}/archive_{counter}.png'):
            break
        diff, simi =  fidelity_detect.fidelity_issue_screenshot(dirr, f'live_{counter}', f'archive_{counter}')
        interact_simi = min(interact_simi, simi)
        counter += 1
    diff_layout, _ = fidelity_detect.fidelity_issue(dirr, 'live', 'archive', meaningful=True)
    return diff, simi, diff_layout, interact_simi

def exception_label(hostname):
    dirr = f'{write_dir}/{hostname}'
    if not os.path.exists(f'{dirr}/results.json'):
        return
    if not os.path.exists(f'../../wayback-crawl/responses/live_gt_500/{hostname}_exceptions.json'):
        return
    archive_results = json.load(open(f'{dirr}/results.json', 'r'))
    live_exceps = defaultdict(int)
    archive_exceps = defaultdict(int)
    for _, stage_result in archive_results.items():
        result = [r for r in stage_result['results'] if r['type'] == 'exceptions']
        for target_result in result:
            for r in target_result['exceptions']:
                if r['uncaught']:
                    desc = r['description'].split('\n')[0]
                    archive_exceps[desc] += 1
    live_results = json.load(open(f'../../wayback-crawl/responses/live_gt_500/{hostname}_exceptions.json', 'r'))
    for excep in live_results:
        desc = excep['description'].split('\n')[0]
        live_exceps[desc] += 1
    for e, count in archive_exceps.items():
        if e not in live_exceps or live_exceps[e] < count:
            return True
    return False


def screenshot_heuristic_label(dirr):
    if not os.path.exists(f'{dirr}/archive.png'):
        return
    # # Load your image
    # image = cv2.imread(f'{dirr}/archive.png')
    # # Step 1: Find dominant color
    # dominant_color = find_dominant_color(image)
    # # Step 2: Find largest rectangle of the dominant color
    # rectangle = find_largest_rectangle(image, dominant_color)
    # area = rectangle[2] * rectangle[3]
    # if area > 1920*1080/frac:
    #     print("Large area", area)
    #     return True, area

    counter = 0
    curr = 'archive'
    keywords = ['menu', 'search']
    events = json.load(open(f'{dirr}/archive_events.json', 'r'))
    while True:
        if not os.path.exists(f'{dirr}/archive_{counter}.png'):
            break
        toskip = True
        event = events[counter]
        if any([k in event['element'].lower() for k in keywords]):
            if len(event['events']) % 2 == 1:
                toskip = False
        if toskip:
            curr = f'archive_{counter}'
            counter += 1
            continue
        diff, simi = fidelity_detect.fidelity_issue_screenshot(dirr, curr, f'archive_{counter}')
        if simi >= 1:
            print("No diff in screenshot")
            return True
        counter += 1
        curr = f'archive_{counter}'
    return False

def _correlate_worker(hostname):
    print(hostname)
    # slabel = screenshot_writes_label(f'{write_dir}/{hostname}')
    slabel = screenshot_heuristic_label(f'{gt_dir}/{hostname}')
    elabel = exception_label(hostname)
    return hostname, elabel, elabel or slabel

def _correlate_worker_2(hostname, label):
    print(hostname)
    diff, simi, diff_layout, interact_simi = screenshot_gt_label(f'{gt_dir}/{hostname}')
    diff = diff or interact_simi < 1
    diff =  diff if label else diff and simi < 0.95 # and diff_layout    # Filter bugs in screenshot
    elabel = exception_label(hostname)
    print('  ', diff, simi, label)
    return hostname, diff, elabel or interact_simi < 0.8

def _correlate_worker_3(hostname, label):
    print(hostname)
    rlabel, info = screenshot_heuristic_label(f'{gt_dir}/{hostname}')
    return hostname, 0, rlabel, info

def correlate_labels():
    labels = json.load(open('gt_diff.json'))
    screenshot_table = {'tp': 0, 'fp': 0, 'tn': 0, 'fn': 0}
    exception_table = {'tp': 0, 'fp': 0, 'tn': 0, 'fn': 0}
    exception_screenshot_table = {'tp': 0, 'fp': 0, 'tn': 0, 'fn': 0}
    def categorize(label, result):
        if label:
            if result:
                return 'tp'
            else:
                return 'fn'
        else:
            if result:
                return 'fp'
            else:
                return 'tn'
    with multiprocessing.Pool(16) as pool:
        results = pool.map(_correlate_worker, labels.keys())

    for hostname, elabel, eslabel in results:
        label = labels[hostname]
        if elabel is not None:
            exception_table[categorize(label, elabel)] += 1
        if elabel is not None:
            exception_screenshot_table[categorize(label, eslabel)] += 1
    # print("screenshot table:", screenshot_table)
    print("exception table:", exception_table)
    print("exception screenshot table:", exception_screenshot_table)


def correlate_labels_inter_union():
    labels = json.load(open('gt_diff.json'))
    intersection_table = {'tp': 0, 'fp': 0, 'tn': 0, 'fn': 0}
    union_table = {'tp': 0, 'fp': 0, 'tn': 0, 'fn': 0}
    def categorize(label, result):
        if label:
            if result:
                return 'tp'
            else:
                return 'fn'
        else:
            if result:
                return 'fp'
            else:
                return 'tn'
    with multiprocessing.Pool(16) as pool:
        results = pool.map(_correlate_worker, labels.keys())

    for hostname, slabel, elabel in results:
        label = labels[hostname]
        ilabel = slabel and elabel
        ilabel = ilabel if ilabel is not None else False
        ulabel = slabel or elabel
        ulabel = ulabel if ulabel is not None else False
        intersection_table[categorize(label, ilabel)] += 1
        union_table[categorize(label, ulabel)] += 1
    print("intersection table:", intersection_table)
    print("union table:", union_table)


def correlate_labels_strong_real():
    labels = json.load(open('gt_diff.json'))
    strong_table = {'tp': 0, 'fp': 0, 'tn': 0, 'fn': 0}
    real_table = {'tp': 0, 'fp': 0, 'tn': 0, 'fn': 0}
    def categorize(label, result):
        if label:
            if result:
                return 'tp'
            else:
                return 'fn'
        else:
            if result:
                return 'fp'
            else:
                return 'tn'
    with multiprocessing.Pool(16) as pool:
        results = pool.starmap(_correlate_worker_3, labels.items())
    # results=  []
    # for hostname, label in labels.items():
    #     results.append(_correlate_worker_3(hostname, label))
    #     if len(results) > 100:
    #         break

    real_detail = []
    for hostname, slabel, rlabel, info in results:
        label = labels[hostname]
        strong_table[categorize(label, slabel)] += 1
        real_table[categorize(label, rlabel)] += 1
        real_detail.append({'hostname': hostname, 'label': categorize(label, rlabel), 'area': info/(1920*1080)})

    print("strong table:", strong_table)
    print("real table:", real_table)
    return strong_table, real_table, real_detail

def calc_cover_acc(table):
    recall = table['tp'] / (table['tp'] + table['fn'])
    precision = table['tp'] / (table['tp'] + table['fp'])
    f1 = 2 * precision * recall / (precision + recall)
    return recall, precision, f1

correlate_labels()
# correlate_labels_inter_union()

# fracs = [2,3,4,8,16,32, 64, 128, 256, 512, 1024]
# # fracs = [16]
# results = []
# for i in fracs:
#     frac = i
#     strong_table, real_table, real_detail = correlate_labels_strong_real()
#     # json.dump(real_detail, open(f'real_detail.json', 'w'), indent=2)
#     rec, pre, f1 = calc_cover_acc(real_table)
#     results.append((rec, pre, f1))

# for i, (r, p, f) in zip(fracs, results):
#     print(i, "precision:", p, "recall:", r, "f1:", f)
    