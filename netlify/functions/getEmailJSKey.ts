import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  // @ts-ignore
  return {
    statusCode: 200,
    body: JSON.stringify({
      apiKey: process.env.EMAIL_JS_KEY,
    }),
  };
};

export { handler };
