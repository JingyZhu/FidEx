import cv2
import numpy as np
import json
import os
import itertools
import pandas as pd


# total = 1920 * 1080 * 3 # resolution * channels
N = 10

def score(live, archive):
    diff = live - archive
    total = live.shape[0]*live.shape[1]*live.shape[2]
    same = np.count_nonzero(diff == 0)
    return same / total

def diff(img1, img2, output_name='test'):
    if not os.path.exists(img1) or not os.path.exists(img2):
        return 0
    img1 = cv2.imread(img1)
    img2 = cv2.imread(img2)
    print(img1.shape, img2.shape)
    height = min(img1.shape[0], img2.shape[0])
    width = min([img1.shape[1], img2.shape[1]])
    img1 = img1[:height,:width,:]
    img2 = img2[:height,:width,:]
    
    diff_score = score(img1, img2)
    # print(f"{diff_score:.4f}")

    imgdiff = np.absolute(img1 - img2)
    cv2.imwrite(f'{output_name}_diff.png', imgdiff)
    return diff_score

def pariwise_comp(directory):
    simi = np.zeros((N, N))
    min_score, max_score = None, None
    for l, r in itertools.combinations(list(range(N)), 2):
        print("l r:", l, r)
        left_img = f'{directory}/{l+1}.png'
        right_img = f'{directory}/{r+1}.png'
        if not os.path.exists(left_img) or not os.path.exists(right_img):
            continue
        score = diff(left_img, right_img, f"{directory}/{l+1}_{r+1}")
        print("TOTAL score:", score)
        simi[r, l] = score
        if min_score is None:
            min_score = score
            max_score = score
        else:
            min_score = min(min_score, score)
            max_score = max(max_score, score)
        # left_elem = f'../recording/pageinfo/{directory}_{l}/element.png'
        # right_elem = f'../recording/pageinfo/{directory}_{r}/element.png'
        # score = pixel_diff.diff(left_elem, right_elem, f"{directory}_{l}_{r}_element")
        # # assert(score >= 1)
        # print("ELEMENT score:", score)
    df = pd.DataFrame(np.around(simi, 3))
    df.to_csv(f'{directory}/pairwise_comp.csv')
    return min_score, max_score


if __name__ == '__main__':
    pariwise_comp('puppeteer_2')
