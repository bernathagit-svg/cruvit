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
    const body = JSON.parse(event.body);
    const { action, predictionId, prompt } = body;

    if (action === 'start') {
      const reqBody = {
        version: 'af1a68a271597604546c09c64aabcd7782c114a63539a4a8d14d1eeda5630c33',
        input: {
          prompt: prompt + ', professional garden photography, golden hour lighting, high quality, 8k',
          negative_prompt: 'ugly, blurry, low quality, cartoon, text, watermark',
          width: 1024,
          height: 768,
          num_inference_steps: 30,
          num_outputs: 1,
          apply_watermark: false
        }
      };

      const response = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Token ' + process.env.REPLICATE_KEY
        },
        body: JSON.stringify(reqBody)
      });

      const data = await response.json();
      
      // Return full response including any error details
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(data)
      };
    }

    if (action === 'poll') {
      const response = await fetch('https://api.replicate.com/v1/predictions/' + predictionId, {
        headers: { 'Authorization': 'Token ' + process.env.REPLICATE_KEY }
      });
      const data = await response.json();
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(data)
      };
    }

    return { statusCode: 400, body: 'Invalid action' };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message, stack: err.stack })
    };
  }
}
