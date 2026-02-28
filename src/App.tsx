import { useState, useCallback, useEffect, useRef } from 'react';
import { BlockitClient, BlockType, BlockSnapshot, DocumentRef } from '@lark-opdev/block-docs-addon-api';
import './index.css';

// 声明版本号类型
declare const APP_VERSION: string;

const DocMiniApp = new BlockitClient().initAPI();

// 判断是否为文本类块
const isTextualBlock = (block: BlockSnapshot) => {
  return (
    block.type === BlockType.TEXT ||
    block.type.includes('heading') ||
    block.type === BlockType.BULLET ||
    block.type === BlockType.ORDERED ||
    block.type === BlockType.QUOTE ||
    block.type === BlockType.TODO
  );
};

// 获取文档字数（分别统计友好块和问题块）
const getDocumentWordCount = async (docRef: DocumentRef) => {
  const blockSnapshot = await DocMiniApp.Document.getRootBlock(docRef);
  let friendlyCount = 0;
  let unfriendlyCount = 0;

  const traverseBlocks = async (block: BlockSnapshot): Promise<void> => {
    // 忽略的块类型不统计
    if (IGNORED_BLOCK_TYPES.includes(block.type)) {
      if (block.childSnapshots) {
        for (const childSnapshot of block.childSnapshots) {
          await traverseBlocks(childSnapshot);
        }
      }
      return;
    }

    const normalizedType = normalizeBlockType(block.type);
    const isUnfriendly = UNFRIENDLY_BLOCK_TYPES.includes(normalizedType);

    if (isTextualBlock(block)) {
      const textLength = block.data?.plain_text?.length || 0;
      if (isUnfriendly) {
        unfriendlyCount += textLength;
      } else {
        friendlyCount += textLength;
      }
    }

    if (block.childSnapshots) {
      for (const blockChildSnapshot of block.childSnapshots) {
        await traverseBlocks(blockChildSnapshot);
      }
    }
  };

  await traverseBlocks(blockSnapshot);
  return { friendly: friendlyCount, unfriendly: unfriendlyCount, total: friendlyCount + unfriendlyCount };
};

// 估算 Token 数量
// 中文约 0.5 token/字符，英文按单词分词约 0.75 token/词
const estimateTokenCount = (text: string): number => {
  // 计算中文字符
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  // 计算英文字符（排除空白）
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  // 其他字符按 1 token 估算
  const otherChars = text.length - chineseChars - englishWords;

  // 估算：中文 0.5 token/字，英文 1.33 token/词，其他 1 token/字符
  return Math.ceil(chineseChars * 0.5 + englishWords * 1.33 + otherChars);
};

// 获取文档 Token 数量（分别统计友好块和问题块）
const getDocumentTokenCount = async (docRef: DocumentRef) => {
  const blockSnapshot = await DocMiniApp.Document.getRootBlock(docRef);
  let friendlyText = '';
  let unfriendlyText = '';

  const traverseBlocks = async (block: BlockSnapshot): Promise<void> => {
    // 忽略的块类型不统计
    if (IGNORED_BLOCK_TYPES.includes(block.type)) {
      for (const childSnapshot of block.childSnapshots) {
        await traverseBlocks(childSnapshot);
      }
      return;
    }

    const normalizedType = normalizeBlockType(block.type);
    const isUnfriendly = UNFRIENDLY_BLOCK_TYPES.includes(normalizedType);

    if (isTextualBlock(block) && block.data?.plain_text) {
      if (isUnfriendly) {
        unfriendlyText += block.data.plain_text;
      } else {
        friendlyText += block.data.plain_text;
      }
    }

    for (const blockChildSnapshot of block.childSnapshots) {
      await traverseBlocks(blockChildSnapshot);
    }
  };

  await traverseBlocks(blockSnapshot);

  const friendlyTokens = estimateTokenCount(friendlyText);
  const unfriendlyTokens = estimateTokenCount(unfriendlyText);
  return {
    friendly: friendlyTokens,
    unfriendly: unfriendlyTokens,
    total: friendlyTokens + unfriendlyTokens
  };
};

// 块类型统计结果接口
interface BlockCountResult {
  total: number;
  byType: Record<string, number>;
}

// 需要忽略的块类型
const IGNORED_BLOCK_TYPES = ['page', 'table_cell', 'grid_column', 'grid'];

// 议程相关块类型映射
const AGENDA_BLOCK_TYPES = ['agenda', 'agenda_item', 'agenda_item_title', 'agenda_item_content'];

// OKR相关块类型映射
const OKR_BLOCK_TYPES = ['okr', 'okr_objective', 'okr_key_result', 'okr_progress'];

// 友好标题块类型（1~5级）
const FRIENDLY_HEADING_TYPES = ['heading1', 'heading2', 'heading3', 'heading4', 'heading5'];

// 不友好标题块类型（6~9级）
const UNFRIENDLY_HEADING_TYPES = ['heading6', 'heading7', 'heading8', 'heading9'];

// 列表块类型（有序和无序）
const LIST_BLOCK_TYPES = [BlockType.BULLET, BlockType.ORDERED];

// 统一块类型名称
const normalizeBlockType = (type: string): string => {
  if (AGENDA_BLOCK_TYPES.includes(type)) return 'agenda';
  if (OKR_BLOCK_TYPES.includes(type)) return 'okr';
  if (FRIENDLY_HEADING_TYPES.includes(type)) return 'heading';
  if (UNFRIENDLY_HEADING_TYPES.includes(type)) return 'unfriendly_heading';
  if (LIST_BLOCK_TYPES.includes(type as BlockType)) return 'list';
  return type;
};

// 不友好块类型列表
const UNFRIENDLY_BLOCK_TYPES = [
  'unfriendly_heading',
  'iframe', 'isv', 'task', 'okr',
  'whiteboard', 'agenda',
  'ai_template', 'fallback', 'undefined'
];

// 页面块信息接口
interface PageBlockInfo {
  id: string;
  title: string;
  blockType: string;
  childBlockTypes: Record<string, number>;
  childBlockCount: number;
}

// 统计文档中所有块的类型
const getBlockCount = async (docRef: DocumentRef): Promise<BlockCountResult> => {
  const blockSnapshot = await DocMiniApp.Document.getRootBlock(docRef);
  const result: BlockCountResult = {
    total: 0,
    byType: {}
  };

  const traverseBlocks = async (block: BlockSnapshot): Promise<void> => {
    // 忽略的块类型不统计
    if (IGNORED_BLOCK_TYPES.includes(block.type)) {
      for (const childSnapshot of block.childSnapshots) {
        await traverseBlocks(childSnapshot);
      }
      return;
    }

    // 统计当前块
    result.total++;
    const blockType = normalizeBlockType(block.type);
    result.byType[blockType] = (result.byType[blockType] || 0) + 1;

    // 递归遍历子块
    for (const childSnapshot of block.childSnapshots) {
      await traverseBlocks(childSnapshot);
    }
  };

  await traverseBlocks(blockSnapshot);
  return result;
};

// 获取页面块及其子块的类型信息
const getPageBlocksInfo = async (docRef: DocumentRef): Promise<PageBlockInfo[]> => {
  const blockSnapshot = await DocMiniApp.Document.getRootBlock(docRef);
  const pageBlocks: PageBlockInfo[] = [];

  // 遍历文档的所有直接子块，找出页面块
  const findPageBlocks = async (block: BlockSnapshot, parentTitle?: string) => {
    const isPage = block.type === 'page' || block.type === BlockType.PAGE;

    if (isPage) {
      const pageInfo: PageBlockInfo = {
        id: block.id,
        title: block.data?.title || parentTitle || '未命名页面',
        blockType: block.type,
        childBlockTypes: {},
        childBlockCount: 0
      };

      // 递归统计子块的类型
      const countChildBlocks = async (childBlock: BlockSnapshot) => {
        pageInfo.childBlockCount++;
        pageInfo.childBlockTypes[childBlock.type] = (pageInfo.childBlockTypes[childBlock.type] || 0) + 1;
        for (const subChild of childBlock.childSnapshots) {
          await countChildBlocks(subChild);
        }
      };

      for (const child of block.childSnapshots) {
        await countChildBlocks(child);
      }

      pageBlocks.push(pageInfo);
    } else {
      // 非页面块，继续递归查找
      for (const childBlock of block.childSnapshots) {
        await findPageBlocks(childBlock, parentTitle);
      }
    }
  };

  await findPageBlocks(blockSnapshot);
  return pageBlocks;
};

// 获取所有问题块的 ID 列表
const getUnfriendlyBlockIds = async (docRef: DocumentRef): Promise<string[]> => {
  const blockSnapshot = await DocMiniApp.Document.getRootBlock(docRef);
  const unfriendlyIds: string[] = [];

  const traverseBlocks = async (block: BlockSnapshot): Promise<void> => {
    // 忽略的块类型跳过
    if (IGNORED_BLOCK_TYPES.includes(block.type)) {
      for (const childSnapshot of block.childSnapshots) {
        await traverseBlocks(childSnapshot);
      }
      return;
    }

    const normalizedType = normalizeBlockType(block.type);
    if (UNFRIENDLY_BLOCK_TYPES.includes(normalizedType)) {
      unfriendlyIds.push(block.id);
    }

    for (const childSnapshot of block.childSnapshots) {
      await traverseBlocks(childSnapshot);
    }
  };

  await traverseBlocks(blockSnapshot);
  return unfriendlyIds;
};

// 获取表格统计（收集所有表格ID）
const getTableMergeStats = async (docRef: DocumentRef): Promise<TableStatsResult> => {
  const blockSnapshot = await DocMiniApp.Document.getRootBlock(docRef);
  const tableIds: string[] = [];

  const traverseBlocks = async (block: BlockSnapshot): Promise<void> => {
    // 检查是否为表格块
    if (block.type === BlockType.TABLE) {
      tableIds.push(block.id);
    }

    // 递归遍历子块
    for (const childSnapshot of block.childSnapshots) {
      await traverseBlocks(childSnapshot);
    }
  };

  await traverseBlocks(blockSnapshot);

  return {
    totalTables: tableIds.length,
    tableIds: tableIds
  };
};

// 获取块类型的中文名称
const getBlockTypeName = (type: string): string => {
  const typeNames: Record<string, string> = {
    [BlockType.TEXT]: '文本',
    [BlockType.HEADING1]: '标题',
    [BlockType.HEADING2]: '标题',
    [BlockType.HEADING3]: '标题',
    [BlockType.HEADING4]: '标题',
    [BlockType.HEADING5]: '标题',
    [BlockType.HEADING6]: '标题',
    [BlockType.HEADING7]: '标题',
    [BlockType.HEADING8]: '标题',
    [BlockType.HEADING9]: '标题',
    [BlockType.BULLET]: '列表',
    [BlockType.ORDERED]: '列表',
    [BlockType.QUOTE]: '引用',
    'list': '列表（包含有序、无序列表）',
    [BlockType.TODO]: '待办',
    [BlockType.CODE]: '代码块',
    [BlockType.DIVIDER]: '分割线',
    [BlockType.IMAGE]: '图片',
    [BlockType.TABLE]: '表格',
    [BlockType.TABLE_ROW]: '表格行',
    [BlockType.TABLE_CELL]: '表格单元格',
    [BlockType.FILE]: '文件',
    [BlockType.SHEET]: '表格',
    [BlockType.EMBED]: '嵌入',
    [BlockType.CALLLOUT]: '提示框',
    [BlockType.QUESTION]: '问题',
    [BlockType.EXPAND]: '展开',
    [BlockType.BITABLE]: '多维表格',
    [BlockType.MINDNOTE]: '脑图',
    [BlockType.DOC]: '文档',
    [BlockType.SPEECH]: '语音',
    [BlockType.STICKER]: '表情',
    [BlockType.PDF]: 'PDF',
    [BlockType.VIEW]: '视图',
    [BlockType.COLUMN]: '列',
    [BlockType.COLUMN_SET]: '列集',
    [BlockType.FLOW]: '流程',
    [BlockType.CHART]: '图表',
    // 问题块类型
    'heading': '标题（包含1~5级标题）',
    'unfriendly_heading': '不友好标题（包含6~9级标题）',
    'iframe': '内嵌网页',
    'isv': '云文档小组件',
    'task': '任务',
    'okr': 'OKR（包含目标、关键结果、进展）',
    'whiteboard': '白板（包含脑图、画板、流程图等）',
    'agenda': '议程（包含议程、议程项、标题、内容）',
    'ai_template': 'AI模板',
    'fallback': '降级块（无权限或文档已删除的云文档引用）',
    'undefined': '未知类型',
  };
  return typeNames[type] || type;
};

// 字数统计结果接口
interface WordCountResult {
  friendly: number;
  unfriendly: number;
  total: number;
}

// Token统计结果接口
interface TokenCountResult {
  friendly: number;
  unfriendly: number;
  total: number;
}

// 表格统计结果接口
interface TableStatsResult {
  totalTables: number;
  tableIds: string[]; // 表格ID列表
}

// 选中块信息接口
interface SelectedBlockInfo {
  blockId: string;           // 块的唯一标识符
  blockType: string;         // 块类型（如 'text', 'heading1' 等）
  text: string;              // 块的纯文本内容
  hasError: boolean;         // 是否获取失败
  errorMessage?: string;     // 错误信息
}

export default () => {
  const [wordCount, setWordCount] = useState<WordCountResult>({ friendly: 0, unfriendly: 0, total: 0 });
  const [tokenCount, setTokenCount] = useState<TokenCountResult>({ friendly: 0, unfriendly: 0, total: 0 });
  const [blockStats, setBlockStats] = useState<BlockCountResult | null>(null);
  const [pageBlocks, setPageBlocks] = useState<PageBlockInfo[]>([]);
  const [tableStats, setTableStats] = useState<TableStatsResult | null>(null);
  const [currentUnfriendlyIndex, setCurrentUnfriendlyIndex] = useState<number>(0);
  const [currentTableIndex, setCurrentTableIndex] = useState<number>(0);
  const [friendlyExpanded, setFriendlyExpanded] = useState<boolean>(false);
  const [unfriendlyExpanded, setUnfriendlyExpanded] = useState<boolean>(false);
  const [tableExpanded, setTableExpanded] = useState<boolean>(false);
  const [selectedBlock, setSelectedBlock] = useState<SelectedBlockInfo | null>(null);
  const [debugPanelExpanded, setDebugPanelExpanded] = useState<boolean>(true);
  const interval = useRef<number>(new Date().getTime());
  const docRef = useRef<DocumentRef>(null);
  const unfriendlyBlockIds = useRef<string[]>([]);

  // 计算字数
  const computeWordCount = useCallback(async (docRef: DocumentRef) => {
    const result = await getDocumentWordCount(docRef);
    setWordCount(result);
  }, []);

  // 计算 Token 数量
  const computeTokenCount = useCallback(async (docRef: DocumentRef) => {
    const result = await getDocumentTokenCount(docRef);
    setTokenCount(result);
  }, []);

  // 计算块统计
  const computeBlockStats = useCallback(async (docRef: DocumentRef) => {
    const stats = await getBlockCount(docRef);
    setBlockStats(stats);
  }, []);

  // 获取页面块信息
  const computePageBlocks = useCallback(async (docRef: DocumentRef) => {
    const pages = await getPageBlocksInfo(docRef);
    setPageBlocks(pages);
  }, []);

  // 计算表格合并单元格统计
  const computeTableStats = useCallback(async (docRef: DocumentRef) => {
    const stats = await getTableMergeStats(docRef);
    setTableStats(stats);
  }, []);

  // 获取选中块信息
  const fetchSelectedBlockInfo = useCallback(async (docRef: DocumentRef) => {
    try {
      const selectionItems = await DocMiniApp.Selection.getSelection(docRef);

      if (!selectionItems || selectionItems.length === 0) {
        setSelectedBlock(null);
        return;
      }

      // 获取第一个选中项
      const firstItem = selectionItems[0];
      const blockSnapshot = firstItem.blockSnapshot;
      const blockType = blockSnapshot?.type || 'unknown';

      // 特殊处理：画板类型
      if (blockType === 'whiteboard' || blockType === BlockType.WHITEBOARD) {
        // 请求服务器
        const fetchData = async () => {
          const url = new URL('http://10.30.40.95:8081/whiteboard');
          url.searchParams.append('documentId', docRef.docToken);
          url.searchParams.append('recordId', blockSnapshot.recordId);

          var res = "";
          try {
            const response = await fetch(url.toString());
            if (!response.ok) throw new Error('网络响应不正常');
            var data = await response.json();
            if (data.Code != 0) {
              res = data.Message;
            } else {
              res = data.Data;
            }
          } catch (err) {
            console.error(err);
            res = JSON.stringify(err);
          }

          return res;
        };

        setSelectedBlock({
          blockId: firstItem.blockId,
          blockType: blockType,
          text: await fetchData(),
          hasError: false
        });
        return;
      }

      // ExtendedSelectionItem 已经包含 blockSnapshot，直接使用
      setSelectedBlock({
        blockId: firstItem.blockId,
        blockType: blockType,
        text: blockSnapshot?.data?.plain_text || '',
        hasError: false
      });
    } catch (error) {
      console.error('fetchSelectedBlockInfo 错误:', error);
      setSelectedBlock({
        blockId: '',
        blockType: '',
        text: '',
        hasError: true,
        errorMessage: error.message || String(error)
      });
    }
  }, []);

  // 跳转到下一个问题块
  const scrollToNextUnfriendly = useCallback(async () => {
    if (!docRef.current || unfriendlyBlockIds.current.length === 0) return;

    const currentId = unfriendlyBlockIds.current[currentUnfriendlyIndex];
    const blockRef = await DocMiniApp.getBlockRefById(docRef.current, currentId);
    DocMiniApp.Viewport.scrollToBlock(blockRef, true);

    // 下一个，循环
    setCurrentUnfriendlyIndex((prev) => (prev + 1) % unfriendlyBlockIds.current.length);
  }, [currentUnfriendlyIndex]);

  // 跳转到下一个表格
  const scrollToNextTable = useCallback(async () => {
    if (!docRef.current || !tableStats || tableStats.tableIds.length === 0) return;

    const currentId = tableStats.tableIds[currentTableIndex];
    const blockRef = await DocMiniApp.getBlockRefById(docRef.current, currentId);
    DocMiniApp.Viewport.scrollToBlock(blockRef, true);

    // 下一个，循环
    setCurrentTableIndex((prev) => (prev + 1) % tableStats.tableIds.length);
  }, [currentTableIndex, tableStats]);

  const INTERVAL = 16;

  useEffect(() => {
    (async () => {
      // 获取文档引用
      docRef.current = await DocMiniApp.getActiveDocumentRef();
      // 监听文档变化
      DocMiniApp.Selection.onSelectionChange(docRef.current, () => {
        let now = new Date().getTime();
        if (now - interval.current > INTERVAL) {
          computeWordCount(docRef.current);
          computeTokenCount(docRef.current);
          computeBlockStats(docRef.current);
          computePageBlocks(docRef.current);
          computeTableStats(docRef.current);
          fetchSelectedBlockInfo(docRef.current);
          interval.current = now;
        }
      });
      // 初始化
      computeWordCount(docRef.current);
      computeTokenCount(docRef.current);
      computeBlockStats(docRef.current);
      computePageBlocks(docRef.current);
      computeTableStats(docRef.current);
      fetchSelectedBlockInfo(docRef.current);
      // 获取问题块ID列表
      unfriendlyBlockIds.current = await getUnfriendlyBlockIds(docRef.current);
    })();
    return () => {
      (async () => {
        DocMiniApp.Selection.offSelectionChange(docRef.current, () => {});
      })();
    };
  }, []);

  return (
    <div className="wordcount-demo">
      {/* 头部:左侧组件名,右侧统计 */}
      <div className="header">
        <div className="title-section">
          <div className="app-name">Sofunny 飞书云文档检查器</div>
          <span className="app-version">v{process.env.APP_VERSION || '0.0.0'}</span>
        </div>
        <div className="header-stats">
          <span className="stat-item">
            文档字数:<span className="count">{wordCount.total}</span>
          </span>
          <span className="stat-item">
            预估 Token:<span className="count">{tokenCount.total}</span>
          </span>
        </div>
      </div>

      {/* 统计结果分栏显示 */}
      <div className="stats-columns">
        {/* 左侧：友好块 */}
        {blockStats && (
          <div className="stats-column block-stats">
            <div className="stats-header" onClick={() => setFriendlyExpanded(!friendlyExpanded)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className="expand-icon">{friendlyExpanded ? '▼' : '▶'}</span>
                <h3 style={{ margin: 0 }}>友好块：{Object.entries(blockStats.byType).filter(([type]) => !UNFRIENDLY_BLOCK_TYPES.includes(type)).reduce((sum, [, count]) => sum + count, 0)}</h3>
              </div>
            </div>
            {friendlyExpanded && (
              <div className="stats-body">
                <ul className="block-list">
                  {Object.entries(blockStats.byType)
                    .filter(([type]) => !UNFRIENDLY_BLOCK_TYPES.includes(type))
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => (
                      <li key={type}>
                        {getBlockTypeName(type)}: <span className="count">{count}</span>
                      </li>
                    ))}
                  {Object.keys(blockStats.byType).filter(type => !UNFRIENDLY_BLOCK_TYPES.includes(type)).length === 0 && (
                    <li className="no-data">无</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* 右侧：问题块 */}
        {blockStats && (
          <div className="stats-column page-blocks">
            <div className="stats-header">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setUnfriendlyExpanded(!unfriendlyExpanded)}>
                  <span className="expand-icon">{unfriendlyExpanded ? '▼' : '▶'}</span>
                  <h3 style={{ margin: 0 }}>问题块：{Object.entries(blockStats.byType).filter(([type]) => UNFRIENDLY_BLOCK_TYPES.includes(type)).reduce((sum, [, count]) => sum + count, 0)}</h3>
                </div>
                {Object.entries(blockStats.byType).filter(([type]) => UNFRIENDLY_BLOCK_TYPES.includes(type)).reduce((sum, [, count]) => sum + count, 0) > 0 && (
                  <button className="scroll-btn" onClick={scrollToNextUnfriendly}>
                    跳转
                  </button>
                )}
              </div>
            </div>
            {unfriendlyExpanded && (
              <div className="stats-body">
                <ul className="block-list">
                  {Object.entries(blockStats.byType)
                    .filter(([type]) => UNFRIENDLY_BLOCK_TYPES.includes(type))
                    .sort(([, a], [, b]) => b - a)
                    .map(([type, count]) => (
                      <li key={type}>
                        {getBlockTypeName(type)}: <span className="count">{count}</span>
                      </li>
                    ))}
                  {Object.keys(blockStats.byType).filter(type => UNFRIENDLY_BLOCK_TYPES.includes(type)).length === 0 && (
                    <li className="no-data">无</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* 表格统计 */}
        {tableStats && (
          <div className="stats-column table-stats">
            <div className="stats-header">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setTableExpanded(!tableExpanded)}>
                  <span className="expand-icon">{tableExpanded ? '▼' : '▶'}</span>
                  <h3 style={{ margin: 0 }}>表格：{tableStats.totalTables}</h3>
                </div>
                {tableStats.totalTables > 0 && (
                  <button className="scroll-btn" onClick={scrollToNextTable}>
                    跳转
                  </button>
                )}
              </div>
            </div>
            {tableExpanded && (
              <div className="stats-body">
                <div className="table-summary">
                  <div className="summary-item">
                    <span className="summary-label">表格总数:</span>
                    <span className="count">{tableStats.totalTables}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 调试面板 - 放在最下方 */}
      <div className="debug-panel">
        <div className="debug-header" onClick={() => setDebugPanelExpanded(!debugPanelExpanded)}>
          <span className="expand-icon">{debugPanelExpanded ? '▼' : '▶'}</span>
          <h3>选中块调试信息</h3>
        </div>
        {debugPanelExpanded && (
          <div className="debug-content">
            {selectedBlock ? (
              selectedBlock.hasError ? (
                <div className="debug-error">错误: {selectedBlock.errorMessage}</div>
              ) : (
                <div className="debug-info">
                  <div className="debug-row">
                    <span className="debug-label">块 ID:</span>
                    <span className="debug-value">{selectedBlock.blockId}</span>
                  </div>
                  <div className="debug-row">
                    <span className="debug-label">块类型:</span>
                    <span className="debug-value">{selectedBlock.blockType}</span>
                  </div>
                  <div className="debug-row">
                    <span className="debug-label">文本内容:</span>
                  </div>
                  <div className="debug-text-content">
                    {selectedBlock.text || '<空>'}
                  </div>
                </div>
              )
            ) : (
              <div className="debug-empty">未选中任何块</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
