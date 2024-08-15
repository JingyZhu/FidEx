import test_utils

def test_issue_gt():
    dirs = [
        # 'dpb-web.instantencore.com_8316c708d4', # ! Inner scroll bar, live recording unable to scroll
        # 'www.pnnl.gov_75feec7fe3', # ! Non determinisitic a tag href
        # 'ctcwcs.com_f3bd46bcc1', # ! Twitter timeline missing
        # 'statedept.tumblr.com_6964c1d8fc', # ! Missing signup and cookie (indeed fidelity issue)
        # 'iteams.dshs.texas.gov_3d8b742055', # !! 404 on archive

        # 'investuttarakhand.com_9e8f65e491', # ! Same screenshot, same <product-modal>, on live directly under body, on archive below some main section
        # 'media.ksc.nasa.gov_793c637518', # ! Screenshot size seems different
    ]