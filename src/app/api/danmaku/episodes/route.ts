/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import {
  getErrorMessage,
  requestDanmakuApi,
} from '../_utils';


export async function GET(request: NextRequest) {
  try {
    const animeId = request.nextUrl.searchParams.get('animeId');

    if (!animeId) {
      return NextResponse.json(
        {
          errorCode: -1,
          success: false,
          errorMessage: 'Missing animeId',
          bangumi: {
            bangumiId: '',
            animeTitle: '',
            episodes: [],
          },
        },
        { status: 400 }
      );
    }

    const response = await requestDanmakuApi(
      `/api/v2/bangumi/${animeId}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      30000,
      'Danmaku episodes'
    );

    return NextResponse.json(await response.json());
  } catch (error) {
    const message =
      error instanceof Error && error.name === 'AbortError'
        ? 'Danmaku request timeout'
        : getErrorMessage(error, 'Danmaku episodes failed');

    console.error('Danmaku episodes route error:', error);

    return NextResponse.json(
      {
        errorCode: -1,
        success: false,
        errorMessage: message,
        bangumi: {
          bangumiId: '',
          animeTitle: '',
          episodes: [],
        },
      },
      { status: 500 }
    );
  }
}

