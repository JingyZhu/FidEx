// Example of how to enable fetch for a specific URL
{
    "command": "Fetch.enable", 
    "parameters": { 
        "patterns": [{ 
            "urlPattern": "http?://localhost:8081/https://test/index.html","resourceType": "", 
            "requestStage": "Response" 
        }] 
    }
}

{
    "command": "Fetch.enable", 
    "parameters": { 
        "patterns": [
            { 
                "urlPattern": "http?://localhost:8080/eot/20230912213801/https://nimhd.nih.gov/index.html",
                "resourceType": "", 
                "requestStage": "Response" 
            },
            { 
                "urlPattern": "http?://localhost:8080/eot/20230912213801/https://nimhd.nih.gov/",
                "resourceType": "", 
                "requestStage": "Response" 
            },
            {
                "urlPattern": "http?://localhost:8080/eot/20230912213801js_/https://nimhd.nih.gov/assets/js/jquery/dist/jquery.js",
                "resourceType": "",
                "requestStage": "Response"
            }
        ]
    }
}