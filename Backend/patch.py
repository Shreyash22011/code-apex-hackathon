import os

code = """
@app.get("/analysis/{table_name}")
def get_table_analysis(table_name: str):
    from analysis import compute_analysis
    from new_llm_funcs import prompt_table_analysis
    import llm
    
    try:
        data = compute_analysis(table_name)
    except Exception as e:
        return {"error": str(e)}
        
    prompt = prompt_table_analysis(
        table_name,
        data["numeric_stats"],
        data["categorical_stats"],
        data["date_stats"],
        data["correlation_pairs"]
    )
    
    analysis_text = llm.ask_llm(prompt, task="summary")
    data["analysis_text"] = analysis_text
    return data

"""

with open('backend/main.py', 'r') as f:
    text = f.read()

text = text.replace('if __name__ == "__main__":', code + 'if __name__ == "__main__":')

with open('backend/main.py', 'w') as f:
    f.write(text)
print("Route added!")
