import pixel_diff
import itertools
import pandas as pd
import numpy as np
from collections import defaultdict
import json
import os

N = 10

def replay_diff(directory):
    simi = np.zeros((N, N))
    min_score, max_score = None, None
    for l, r in itertools.combinations(list(range(N)), 2):
        print("l r:", l, r)
        left_img = f'../recording/pageinfo/{directory}_{l}/dimension.png'
        right_img = f'../recording/pageinfo/{directory}_{r}/dimension.png'
        if not os.path.exists(left_img) or not os.path.exists(right_img):
            continue
        score = pixel_diff.diff(left_img, right_img, f"{directory}_{l}_{r}")
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
    df.to_csv(f'img/{directory}.csv')
    return min_score, max_score

# directory = 'stovallworkshop.com_replay'
results = []
metadata = json.load(open('../recording/sampled_metadata.json', 'r'))
for m in metadata:
    archive_url = m['wayback']
    archive_name = m['directory'].split('_')[0]
    directory = f'{archive_name}_replay'
    min_score, max_score = replay_diff(directory)
    results.append({'directory': directory, 'min_simi': min_score, 'max_simi': max_score})
    json.dump(results, open('replay_pixel_diff.json', 'w+'), indent=2)


# NUM = 5
# results = {}
# for l, r in itertools.combinations(list(range(N)), 2):
#     print("l r:", l, r)
#     scores = []
#     for i in range(NUM):
#         left_img = f'../recording/pageinfo/{directory}_{l}/element_{i}.png'
#         right_img = f'../recording/pageinfo/{directory}_{r}/element_{i}.png'
#         score = pixel_diff.diff(left_img, right_img, f"{directory}_{l}_{r}_{i}")
#         print("score:", score)
#         scores.append(score)
#     results[f'{l}-{r}'] = scores
# json.dump(results, open(f'img/{directory}.json', 'w+'), indent=2)