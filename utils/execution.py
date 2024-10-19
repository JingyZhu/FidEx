import functools

class Stack:
    def __init__(self, stack: list):
        """
        stack: 
          [
            {
              callFrame: [
                {
                  url: str,
                  functionName: str,
                  lineNumber: int,
                  columnNumber: int
                }
              ],
              description: str
            }
          ]
        """
        self.stack = stack
    
    @functools.cached_property
    def serialized(self) -> "tuple(tuple)":
        all_frames = []
        for call_frames in self.stack[:1]:
            call_frames = call_frames['callFrames']
            for frame in call_frames:
                if 'wombat.js' not in frame['url']:
                    # all_frames.append((frame['functionName'], frame['url'], frame['lineNumber'], frame['columnNumber']))
                    all_frames.append((frame['functionName']))
        return tuple(all_frames)

    @functools.cached_property
    def scripts(self) -> "set[str]":
        """
        Get the scripts that are related to this write
        """
        scripts = set()
        for call_frames in self.stack:
            call_frames = call_frames['callFrames']
            for frame in call_frames:
                if 'wombat.js' not in frame['url']:
                    scripts.add(frame['url'])
        return scripts