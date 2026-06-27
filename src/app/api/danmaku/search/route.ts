/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import {
  getErrorMessage,
  requestDanmakuApi,
} from '../_utils';


export async function GET(request: NextRequest) {
  try {
    const keyword = request.nextUrl.searchParams.get('keyword');
    if (!keyword) {
      return NextResponse.json(
        {
          errorCode: -1,
          success: false,
          errorMessage: 'Missing keyword',
          animes: [],
        },
        { status: 400 }
      );
    }

    const response = await requestDanmakuApi(
      `/api/v2/search/anime?keyword=${encodeURIComponent(keyword)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      30000,
      'Danmaku search'
    );

    return NextResponse.json(await response.json());
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'Danmaku request timeout'
        : getErrorMessage(error, 'Danmaku search failed');

    console.error('Danmaku search route error:', error);

    return NextResponse.json(
      {
        errorCode: -1,
        success: false,
        errorMessage: message,
        animes: [],
      },
      { status: 500 }
    );
  }
}

