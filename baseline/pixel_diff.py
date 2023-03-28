import cv2
import numpy as np
import json
import os
import itertools
import pandas as pd


# total = 1920 * 1080 * 3 # resolution * channels

def score(live, archive):
    diff = live - archive
    total = live.shape[0]*live.shape[1]*live.shape[2]
    same = np.count_nonzero(diff == 0)
    return same / total

def diff(live_img, archive_img, directory_prefix='test', return_diff_img=False):
    if not os.path.exists(live_img) or not os.path.exists(archive_img):
        return 0
    img1 = cv2.imread(live_img)
    img2 = cv2.imread(archive_img)
    # print(img1.shape, img2.shape)
    height = min(img1.shape[0], img2.shape[0])
    width = min([img1.shape[1], img2.shape[1]])
    img1 = img1[:height,:width,:]
    img2 = img2[:height,:width,:]
    
    diff_score = score(img1, img2)
    # print(f"{diff_score:.4f}")

    imgdiff = np.absolute(img1 - img2)
    if return_diff_img:
        return diff_score, imgdiff
    cv2.imwrite(f'{directory_prefix}_diff.png', imgdiff)
    return diff_score

def run(metadata_file):
    metadata = json.load(open(f'../recording/{metadata_file}', 'r'))
    new_metadata = {}
    img_diffs = []
    for url, value in metadata.items():
        directory = value['directory']
        live_img = f'../recording/pageinfo/{directory}/dimension.png'
        archive_img = f'../recording/pageinfo/{directory}_archive/dimension.png'
        score = diff(live_img, archive_img, directory)
        img_diffs.append({
            'directory': directory,
            'similarity': score
        })
        value['screenshot_similarity'] = score
        new_metadata[url] = value
    json.dump(img_diffs, open('pixel_diff.json', 'w+'), indent=2)
    json.dump(new_metadata, open(f'../recording/{metadata_file}', 'w+'), indent=2)
    


def pairwise_diff(directory, N=10):
    simi = np.zeros((N, N))
    min_score, max_score = None, None
    for l, r in itertools.combinations(list(range(1,N+1)), 2):
        left_img = f'{directory}/{l}.png'
        right_img = f'{directory}/{r}.png'
        if not os.path.exists(left_img) or not os.path.exists(right_img):
            continue
        score = diff(left_img, right_img, f"{directory}/img/{l}_{r}")
        print("TOTAL score:", l, r, score)
        simi[r-1, l-1] = score
        if min_score is None:
            min_score = score
            max_score = score
        else:
            min_score = min(min_score, score)
            max_score = max(max_score, score)
    df = pd.DataFrame(np.around(simi, 3))
    df.to_csv(f'{directory}/metadata.csv')
    return min_score, max_score


if __name__ == '__main__':
    run('../recording/carta_metadata.json')
    