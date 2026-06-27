/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import {
  getErrorMessage,
  requestDanmakuApi,
} from '../_utils';


export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { fileName?: string };
    const fileName = (body.fileName || '').trim();

    if (!fileName) {
      return NextResponse.json(
        {
          errorCode: -1,
          success: false,
          errorMessage: 'Missing fileName',
          isMatched: false,
          matches: [],
        },
        { status: 400 }
      );
    }

    const response = await requestDanmakuApi(
      '/api/v2/match',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fileName }),
      },
      30000,
      'Danmaku match'
    );

    return NextResponse.json(await response.json());
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'Danmaku request timeout'
        : getErrorMessage(error, 'Danmaku match failed');

    console.error('Danmaku match route error:', error);

    return NextResponse.json(
      {
        errorCode: -1,
        success: false,
        errorMessage: message,
        isMatched: false,
        matches: [],
      },
      { status: 500 }
    );
  }
}

