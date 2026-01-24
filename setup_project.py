import json
import os
import sys

def setup_project():
    try:
        with open('code-assets.json', 'r', encoding='utf-8') as f:
            data = json.load(f)
    except FileNotFoundError:
        print("Error: code-assets.json not found.")
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error decoding JSON: {e}")
        sys.exit(1)

    files = data.get('files', {})
    if not files:
        print("No files found in JSON.")
        return

    print(f"Found {len(files)} files to create.")

    for file_path, content in files.items():
        # Handle cases where file_path might differ (e.g., if it needs src/ prefix but doesn't have it, 
        # though usually the JSON has relative paths)
        
        # Ensure directory exists
        directory = os.path.dirname(file_path)
        if directory and not os.path.exists(directory):
            os.makedirs(directory, exist_ok=True)
        
        # Write content
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Created: {file_path}")
        except Exception as e:
            print(f"Failed to create {file_path}: {e}")

if __name__ == "__main__":
    setup_project()
