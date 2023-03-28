import cv2
import numpy as np
import json
import os

# total = 1920 * 1080 * 3 # resolution * channels

def score(live, archive):
    diff = live - archive
    total = live.shape[0]*live.shape[1]*live.shape[2]
    same = np.count_nonzero(diff == 0)
    return same / total

def diff(live_img, archive_img, archive_name='test'):
    if not os.path.exists(live_img) or not os.path.exists(archive_img):
        return 0
    img1 = cv2.imread(live_img)
    img2 = cv2.imread(archive_img)
    print(img1.shape, img2.shape)
    height = min(img1.shape[0], img2.shape[0])
    width = min([img1.shape[1], img2.shape[1]])
    img1 = img1[:height,:width,:]
    img2 = img2[:height,:width,:]
    
    diff_score = score(img1, img2)
    # print(f"{diff_score:.4f}")

    imgdiff = np.absolute(img1 - img2)
    cv2.imwrite(f'img/{archive_name}_diff.png', imgdiff)
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
    


if __name__ == '__main__':
    run('../recording/carta_metadata.json')
