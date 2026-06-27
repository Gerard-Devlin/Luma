/* eslint-disable no-console */

import { NextRequest, NextResponse } from 'next/server';

import {
  getErrorMessage,
  requestDanmakuApi,
} from '../_utils';


interface DanmakuXMLComment {
  p: string;
  m: string;
  cid: number;
}

function parseXmlDanmaku(xmlText: string): DanmakuXMLComment[] {
  const comments: DanmakuXMLComment[] = [];
  const dTagRegex = /<d\s+p="([^"]+)"[^>]*>([^<]*)<\/d>/g;

  let match: RegExpExecArray | null;
  while ((match = dTagRegex.exec(xmlText)) !== null) {
    const p = match[1];
    const m = match[2];
    const parts = p.split(',');
    const cid = Number.parseInt(parts[7] || '0', 10) || 0;

    comments.push({ p, m, cid });
  }

  return comments;
}

export async function GET(request: NextRequest) {
  try {
    const episodeId = request.nextUrl.searchParams.get('episodeId');
    const url = request.nextUrl.searchParams.get('url');

    if (!episodeId && !url) {
      return NextResponse.json({ count: 0, comments: [] }, { status: 400 });
    }

    const response = await requestDanmakuApi(
      episodeId
        ? `/api/v2/comment/${episodeId}?format=xml`
        : `/api/v2/comment?url=${encodeURIComponent(url || '')}&format=xml`,
      {
        method: 'GET',
        headers: {
          Accept: 'application/xml, text/xml',
        },
      },
      120000,
      'Danmaku comments'
    );

    const xmlText = await response.text();
    const comments = parseXmlDanmaku(xmlText);

    return NextResponse.json({
      count: comments.length,
      comments,
    });
  } catch (error) {
    const message = getErrorMessage(error, 'Danmaku comments failed');
    console.error('Danmaku comment route error:', message, error);
    return NextResponse.json({ count: 0, comments: [] }, { status: 500 });
  }
}

