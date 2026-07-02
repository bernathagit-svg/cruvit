export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const { prompt, imageBase64 } = JSON.parse(event.body);

    const buffer = Buffer.from(imageBase64, 'base64');

    // Extract plant names from prompt if present (after "feature these exact plants:")
    let plantSection = '';
    const plantMatch = prompt.match(/feature these exact plants: ([^.]+)/i);
    if (plantMatch) {
      const plantList = plantMatch[1].trim();
      plantSection = `ADD THESE SPECIFIC PLANTS VISIBLY INTO THE SCENE: ${plantList}. `;
    }

    // Build prompt: plants FIRST, then preserve instruction
    const finalPrompt = plantSection
      + 'PRESERVE the exact same garden layout, lawn, paving, walls, furniture and viewpoint from the original photo. '
      + 'Only ADD the specified plants into the existing garden — do NOT change existing structures. '
      + prompt
      + ' Photorealistic garden photography, botanically accurate plants, professional quality.';

    const negativePrompt = 'different viewpoint, different garden structure, different patio shape, different walls, different lawn shape, changed furniture, ugly, blurry, cartoon, text, watermark, painted, illustration';

    const formData = new FormData();
    formData.append('image', new Blob([buffer], { type: 'image/jpeg' }), 'garden.jpg');
    formData.append('prompt', finalPrompt);
    formData.append('negative_prompt', negativePrompt);
    formData.append('mode', 'image-to-image');
    formData.append('strength', '0.30');  // Slightly higher than 0.25 so plants actually appear, but low enough to preserve structure
    formData.append('output_format', 'jpeg');

    const response = await fetch('https://api.stability.ai/v2beta/stable-image/generate/sd3', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + process.env.STABILITY_KEY,
        'Accept': 'image/*'
      },
      body: formData
    });

    if (!response.ok) {
      const err = await response.text();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: err })
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = 'data:image/jpeg;base64,' + base64;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ imageUrl: dataUrl })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
}
