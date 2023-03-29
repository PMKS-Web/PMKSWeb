import { Handler, HandlerEvent, HandlerContext } from '@netlify/functions';

const handler: Handler = async (event: HandlerEvent, context: HandlerContext) => {
  const value = process.env.EMAIL_JS_KEY;

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: `Value of EMAIL_JS_KEY is ${value}.`,
    }),
  };
};

export { handler };
