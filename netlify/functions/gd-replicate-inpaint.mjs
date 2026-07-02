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

  const apiKey = process.env.STABILITY_KEY || process.env.STABILITY_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Missing STABILITY_KEY or STABILITY_API_KEY server environment variable.' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { action, prompt, imageBase64, maskBase64 } = body;

    if (action === 'poll') {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ status: 'succeeded', output: [body.cachedUrl || ''] })
      };
    }

    if (action !== 'start') {
      return { statusCode: 400, body: 'Invalid action' };
    }

    const imageBuffer = Buffer.from(imageBase64, 'base64');
    const maskBuffer = Buffer.from(maskBase64, 'base64');

    const formData = new FormData();
    formData.append('image', new Blob([imageBuffer], { type: 'image/jpeg' }), 'garden.jpg');
    formData.append('mask', new Blob([maskBuffer], { type: 'image/png' }), 'mask.png');

    // Plant name first in prompt for maximum weight
    formData.append('prompt', prompt + ', photorealistic, high quality, professional garden photography, botanically accurate plant, natural lighting, plant rooted in soil');
    formData.append('negative_prompt', 'ugly, blurry, cartoon, text, watermark, floating plant, plant in air, plant not touching ground, unrealistic, illustration, different garden, changed background, different layout, oversized plant, cut off');
    formData.append('output_format', 'jpeg');
    formData.append('grow_mask', '15');

    const response = await fetch('https://api.stability.ai/v2beta/stable-image/edit/inpaint', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + apiKey,
        'Accept': 'image/*'
      },
      body: formData
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Stability inpaint error:', errText);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Stability inpaint error: ' + errText })
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64Out = Buffer.from(arrayBuffer).toString('base64');
    const dataUrl = 'data:image/jpeg;base64,' + base64Out;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ status: 'succeeded', output: [dataUrl], directDataUrl: dataUrl })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
}
