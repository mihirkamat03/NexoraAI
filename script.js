// Defer loading of KaTeX script for better performance (Added 'defer' tag above)
    lucide.createIcons();

    // ***************************************************************
    // IMPORTANT: When running this file LOCALLY, you MUST replace this 
    // placeholder with your actual, valid Google AI API key.
    // ***************************************************************
    const API_KEY_PLACEHOLDER = "AIzaSyBmo0jGYv4w8TwYaOIZhgUgYstvDljlK9Y"; 
    const apiKey = API_KEY_PLACEHOLDER; 
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    const systemPrompt = `You are Nexora AI, a student-focused academic problem-solver. Analyze the image and the user's question. Provide step-by-step solutions using LaTeX delimiters ($...$ for inline, $$...$$ for block) for all mathematical expressions and units.`;

    let uploadedImage = null;

    const imageInput = document.getElementById('image-input');
    const questionInput = document.getElementById('question-input');
    const submitButton = document.getElementById('submit-button');
    const loadingDiv = document.getElementById('loading');
    const answerOutput = document.getElementById('answer-output');
    const resultsContainer = document.getElementById('results-container');
    const imagePreview = document.getElementById('image-preview');
    const imagePreviewContainer = document.getElementById('image-preview-container');

    function checkInputs() {
        submitButton.disabled = !uploadedImage || !questionInput.value.trim();
    }

    window.previewImage = (event) => {
        const file = event.target.files[0];
        if (!file) { imagePreviewContainer.classList.add('hidden'); uploadedImage = null; checkInputs(); return; }
        const reader = new FileReader();
        reader.onload = (e) => {
            imagePreview.src = e.target.result;
            imagePreviewContainer.classList.remove('hidden');
            const base64String = e.target.result.split(',')[1];
            const mimeType = e.target.result.split(':')[1].split(';')[0];
            uploadedImage = { data: base64String, mimeType };
            checkInputs();
        };
        reader.readAsDataURL(file);
    };

    questionInput.addEventListener('input', checkInputs);

    /**
     * Attempts a fetch request with exponential backoff for resilience against temporary 5xx errors (like 503).
     * Increased max retries to 8 and optimized initial delay for faster response on brief server spikes.
     */
    async function fetchWithRetry(url, options, maxRetries = 8) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(url, options);
                if (response.ok) return response;
                
                let delay = 0;
                if (i === 0) {
                    // First retry (Attempt 2) is fast: 500ms
                    delay = 500;
                } else {
                    // Subsequent retries (Attempt 3+) use increasing exponential backoff: 2s, 4s, 8s, 16s...
                    delay = 2**i * 1000; 
                }

                if ((response.status === 429 || response.status >= 500) && i < maxRetries - 1) {
                    await new Promise(r => setTimeout(r, delay));
                } else {
                    const text = await response.text();
                    // Log full error text to console, but keep message concise for UI/stack trace
                    console.error(`API Request failed with status ${response.status}:`, text);
                    throw new Error(`API Status ${response.status}. See console for details.`); 
                }
            } catch (e) { 
                console.error('Fetch error:', e); 
                if (i === maxRetries - 1) throw e; 
                await new Promise(r => setTimeout(r, 2**i * 1000)); 
            }
        }
    }

    function renderLatex(text) {
        if(typeof katex==='undefined') return text;
        // Process Display Math: $$...$$
        let result=text.replace(/\$\$([\s\S]*?)\$\$/g,(m,c)=>{try{return katex.renderToString(c.trim(),{throwOnError:false,displayMode:true});}catch(e){return`<span class="text-red-500">[Math Error]</span>`;}});
        // Process Inline Math: $...$
        result=result.replace(/\$([\s\S]*?)\$/g,(m,c)=>{try{return katex.renderToString(c.trim(),{throwOnError:false,displayMode:false});}catch(e){return`<span class="text-red-500">[Math Error]</span>`;}});
        return result;
    }

    function markdownToHtml(md){
        let html=md.replace(/^##\s*(.*)$/gm,'<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>')
                    .replace(/^#\s*(.*)$/gm,'<h2 class="text-xl font-bold mt-6 mb-3">$1</h2>')
                    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g,'<em>$1</em>')
                    .replace(/_(.*?)_/g,'<em>$1</em>');
        
        // Ensure lists use correct tag filtering
        const LIST_MARKER='<!--LIST-->';
        html=html.replace(/(\n\s*([\*\-]|\d+\.)\s+.*)+/g,l=>{
            let lines=l.split('\n').filter(ln=>ln.trim());
            let isOrdered=/^\d+\./.test(lines[0].trim());
            let listHtml=isOrdered?'<ol>':'<ul>';
            for(let ln of lines){listHtml+=`<li>${ln.trim().replace(/^[\*\-]\s+/,'').replace(/^\d+\.\s+/,'')}</li>`;}
            listHtml+=isOrdered?'</ol>':'</ul>';
            return LIST_MARKER+listHtml+LIST_MARKER;
        });
        
        // Paragraph wrapping
        html=html.split('\n\n').map(p=>{
            p=p.trim();
            if(p.includes(LIST_MARKER)) {
                return p.replace(new RegExp(LIST_MARKER,'g'),'');
            }
            return p.trim()?`<p class="mb-3">${p.trim()}</p>`:'';
        }).join('');
        
        // Remove extraneous list markers leftover from simplified markdown processing
        html = html.replace(/<!--LIST-->/g, ''); 
        
        return html;
    }

    window.generateAnswer=async()=>{
        const userQuery=questionInput.value.trim();
        // Check if API key is present for local development
        if (!apiKey) {
             answerOutput.innerHTML = `<p class="text-red-600 font-bold">API Key Missing!</p>
                                     <p>You must replace <code>const API_KEY_PLACEHOLDER = "";</code> with your valid key to run this locally. The request was blocked with 403 Forbidden because no identity was provided.</p>`;
             loadingDiv.classList.add('hidden');
             resultsContainer.classList.remove('hidden');
             submitButton.disabled = false;
             submitButton.innerHTML = `<i data-lucide="zap" class="w-5 h-5 mr-2"></i> Analyze & Solve`;
             lucide.createIcons();
             return;
        }

        if(!uploadedImage||!userQuery){answerOutput.innerHTML='<p class="text-red-500">Please upload image AND enter question.</p>'; resultsContainer.classList.remove('hidden'); return;}
        submitButton.disabled=true;
        submitButton.innerHTML='<div class="loading-spinner w-5 h-5 mr-2"></div>Analyzing...'; // Added w-5 h-5 for consistent spinner size
        loadingDiv.classList.remove('hidden'); resultsContainer.classList.remove('hidden'); answerOutput.innerHTML='';

        try{
            const payload={
                contents:[{role:"user",parts:[{text:userQuery},{inlineData:{mimeType:uploadedImage.mimeType,data:uploadedImage.data}}]}],
                systemInstruction:{parts:[{text:systemPrompt}]}
            };
            const resp=await fetchWithRetry(apiUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
            const result=await resp.json();
            const candidate=result.candidates?.[0];
            let rawText='';

            if(candidate && candidate.content?.parts?.[0]?.text) {
                rawText=candidate.content.parts[0].text;
            } else if (result.promptFeedback && result.promptFeedback.blockReason) {
                const blockReason = result.promptFeedback.blockReason;
                console.error("API Call Blocked:", result);
                rawText = `<p class="text-red-600 font-bold">Generation Failed: Content Blocked</p>
                           <p>Nexora AI could not generate a solution because the input was blocked due to safety guidelines. (Reason: ${blockReason}). Please try rephrasing your question or using a different image.</p>`;
            } else {
                console.error("API Call Failed (Candidate Missing):", result);
                rawText = `<p class="text-red-600 font-bold">Sorry, Nexora AI couldn't generate a solution.</p>
                           <p>The model might have had trouble interpreting the image, or an unknown internal error occurred. Please check the browser console for details and try again with a clearer image or question.</p>`;
            }

            // Render LaTeX and then apply Markdown formatting
            answerOutput.innerHTML=markdownToHtml(renderLatex(rawText));

        }catch(e){
            console.error(e);
            answerOutput.innerHTML='<p class="text-red-600 font-bold">API Error. Check console and network.</p>';
        }finally{
            loadingDiv.classList.add('hidden');
            submitButton.disabled=false;
            submitButton.innerHTML='<i data-lucide="zap" class="w-5 h-5 mr-2"></i> Analyze & Solve';
            lucide.createIcons();
        }
    };

    document.addEventListener('DOMContentLoaded',checkInputs);
