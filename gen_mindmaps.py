# -*- coding: utf-8 -*-
"""生成四科 Markmap 思维导图大纲（大纲.md → markmap-cli → index.html）"""
import os, subprocess, urllib.parse, re

SITE = os.path.dirname(os.path.abspath(__file__))

def L(text, rel):
    """markdown link with percent-encoded relative URL"""
    return '[%s](%s)' % (text, urllib.parse.quote(rel))

def chapter_link(chapter):
    return L('📖 本章笔记', '笔记/%s.html' % chapter)

SUBJECTS = {
'数据结构': [
 ('第1章 绪论', [
   '数据结构三要素：逻辑结构、存储结构、数据的运算',
   '算法：特性与设计目标',
   '时间复杂度：大 O 分析（单层/嵌套/递归）、最好最坏平均',
   '空间复杂度（原地工作、递归栈）',
 ]),
 ('第2章 线性表', [
   '顺序表：基本操作与动态分配',
   '单链表：建立（头插/尾插）、插入删除、按序号/按值查找',
   '双链表、循环链表',
   '应用：删除重复节点、有序表合并',
 ]),
 ('第3章 栈', [
   '顺序栈与链栈（静态/动态）',
   '应用：括号匹配、表达式求值、进制转换、递归',
 ]),
 ('第4章 队列', [
   '循环队列（判满判空）、链式队列',
   '双端队列',
   '应用：层序遍历、缓冲区',
 ]),
 ('第5章 树', [
   '二叉树：定义与性质、顺序/链式存储',
   '遍历：先中后序（递归/非递归）、层序',
   '线索二叉树（中序线索化）',
   '树与森林：存储（双亲/孩子/孩子兄弟）、转换、遍历对应',
   'BST 查找插入删除；AVL 平衡旋转',
   '哈夫曼树与哈夫曼编码',
 ]),
 ('第6章 图', [
   '存储：邻接矩阵、邻接表、十字链表、邻接多重表',
   '遍历：DFS、BFS',
   '最小生成树：Prim、Kruskal',
   '最短路径：Dijkstra、Floyd',
   '拓扑排序、关键路径（AOE 网）',
   '并查集（Kruskal 判环）',
 ]),
 ('第7章 查找', [
   '顺序查找、折半查找、分块查找',
   'B 树与 B+ 树',
   '红黑树',
   '散列表：冲突处理、查找效率',
 ]),
 ('第8章 排序', [
   '插入：直接插入、折半插入、希尔',
   '交换：冒泡、快速',
   '选择：简单选择、堆排序',
   '归并排序、基数排序',
   '外部排序：多路归并、败者树、最佳归并树',
   '各排序算法对比（稳定性/复杂度/适用）',
 ]),
 ('第9章 数组', [
   '多维数组的存储与地址计算（行优先/列优先）',
   '特殊矩阵压缩：对称、三角、三对角',
   '稀疏矩阵：三元组表、十字链表',
 ]),
 ('第10章 串', [
   'BF 暴力匹配',
   'KMP：next 数组、nextval 优化',
 ]),
],
'计算机网络': [
 ('第1章 计算机网络体系结构', [
   '基本概念：定义、组成、功能、分类',
   '性能指标：带宽、时延、时延带宽积、RTT、利用率',
   '分层结构、协议、接口、服务',
   'OSI 七层 vs TCP/IP vs 五层教学模型',
 ]),
 ('第2章 物理层', [
   '通信基础：码元/波特/比特、信源与信宿',
   '奈奎斯特定理与香农定理',
   '编码（NRZ、曼彻斯特）与调制（QAM）',
   '电路交换、报文交换、分组交换',
   '传输介质与物理层接口',
 ]),
 ('第3章 数据链路层', [
   '功能与组帧：字符计数/字节填充/比特填充/违规编码',
   '差错控制：奇偶校验、CRC、海明码',
   '流量控制与可靠传输（滑动窗口）：停止-等待、GBN、SR',
   '介质访问控制：信道划分（FDM/TDM/WDM/CDMA）、ALOHA、CSMA/CD、CSMA/CA、令牌',
   '局域网：以太网 802.3、802.11、VLAN',
   '广域网：PPP',
   '设备：集线器 vs 交换机（自学习）',
 ]),
 ('第4章 网络层', [
   '功能：异构互连、路由转发、SDN、拥塞控制',
   '路由算法：距离-向量、链路状态、层次路由',
   '路由协议：RIP、OSPF、BGP',
   'IPv4：数据报格式、分类地址、子网划分、CIDR、NAT',
   'ARP、DHCP、ICMP',
   'IPv6：128 位地址、首部、过渡技术',
   'IP 组播与移动 IP',
 ]),
 ('第5章 传输层', [
   '功能：进程间通信、复用分用、端口与套接字',
   'UDP：数据报格式、校验',
   'TCP：报文段首部、三次握手、四次挥手',
   '可靠传输：序号确认、超时重传',
   '流量控制（rwnd）与拥塞控制（慢开始/拥塞避免/快重传/快恢复）',
 ]),
 ('第6章 应用层', [
   '网络应用模型：C/S 与 P2P',
   'DNS：层次域名、四类服务器、递归/迭代',
   'FTP：控制连接与数据连接',
   '电子邮件：SMTP、POP3/IMAP、MIME',
   'WWW 与 HTTP：报文、持续连接、Cookie',
 ]),
],
'操作系统': [
 ('第1章 计算机系统概述', [
   '概念与特征：并发、共享、虚拟、异步',
   '发展历程：手工→批处理→分时→实时',
   '程序运行环境：中断与异常、系统调用',
   '体系结构：宏内核/微内核/外核',
   '操作系统引导、虚拟机',
 ]),
 ('第2章 进程管理', [
   '进程与线程：五态转换、PCB、用户级/内核级线程',
   '进程间通信：共享内存、消息传递、管道、信号',
   'CPU 调度：FCFS/SJF/HRRN/RR/优先级/多级反馈队列',
   '同步与互斥：软件/硬件方法、锁、信号量、经典问题',
   '死锁：四必要条件、预防/避免（银行家）/检测解除',
 ]),
 ('第3章 内存管理', [
   '逻辑/物理地址、内存保护',
   '连续分配与动态分区算法',
   '分页（页表、快表 TLB、二级页表）、分段、段页式',
   '虚拟内存：请求分页、缺页中断',
   '页面置换：OPT、FIFO、LRU、Clock',
   '抖动与工作集',
 ]),
 ('第4章 文件管理', [
   '文件与索引结点 inode、打开文件表',
   '文件的逻辑/物理结构（连续/链接/FAT/索引）',
   '目录：树形目录、硬链接与软链接',
   '文件系统全局结构、空闲空间管理（位示图等）',
   '虚拟文件系统 VFS、挂载',
 ]),
 ('第5章 输入输出管理', [
   '设备分类、I/O 接口与端口',
   'I/O 控制方式：轮询、中断、DMA',
   'I/O 软件层次结构',
   '缓冲区（单/双/循环/缓冲池）',
   '设备分配、SPOOLing',
   '磁盘：结构、调度算法（SSTF/SCAN…）、SSD',
 ]),
],
'计算机组成原理': [
 ('第1章 计算机系统概述', [
   '层次结构、软硬件逻辑等价',
   '冯·诺依曼机与存储程序、五大部件',
   '指令执行过程：取指→分析→执行',
   '性能指标：主频、CPI、MIPS、FLOPS',
 ]),
 ('第2章 数据的表示和计算', [
   '数制转换、BCD 与字符编码',
   '原码/反码/补码/移码',
   '定点数：移位、加减（溢出判断）、乘除',
   '浮点数：规格化、IEEE 754、加减运算',
   'ALU：串行/并行加法器（CLA）',
 ]),
 ('第3章 存储器层次结构', [
   '分类与层次化结构',
   'SRAM vs DRAM、ROM、Flash',
   '主存与 CPU 连接（位扩展/字扩展）',
   '双口 RAM 与多模块存储器（低位交叉）',
   'Cache：映射方式、替换算法、写策略',
   '虚拟存储器：页式/段式、TLB',
 ]),
 ('第4章 指令系统', [
   '指令格式与扩展操作码',
   '寻址方式：立即/直接/间接/寄存器/相对/基址/变址',
   'CISC vs RISC',
 ]),
 ('第5章 中央处理器', [
   'CPU 功能与寄存器（PC/IR/PSW/MAR/MDR）',
   '指令周期与数据通路（单总线/多总线）',
   '控制器：硬布线 vs 微程序',
   '指令流水线：五段式、冒险与处理、超标量',
 ]),
 ('第6章 总线系统', [
   '总线概念、分类、性能指标与带宽',
   '总线仲裁：链式/计数器/独立请求',
   '同步与异步定时',
   '总线标准：PCI/PCIe/USB',
 ]),
 ('第7章 输入输出系统', [
   'I/O 接口与端口编址（统一/独立）',
   '外部设备：显示器、磁盘、RAID',
   '程序查询方式',
   '程序中断：响应/处理过程、屏蔽字、多重中断',
   'DMA：控制器组成、传送过程、与中断对比',
 ]),
],
}

FIT_CSS = (
 '<style>'
 '#app-shell #mindmap{width:100%;height:calc(100vh - var(--header-h,48px));display:block}'
 '#app-shell .nav-content{padding:0;overflow:hidden}'
 '#app-shell .nav-toc{display:none}'
 '.mm-back{position:fixed;bottom:12px;left:12px;z-index:999;background:#3f51b5;color:#fff;'
 'padding:6px 14px;border-radius:20px;text-decoration:none;font-size:14px;opacity:.85;'
 'box-shadow:0 2px 8px rgba(0,0,0,.2)}'
 '.mm-back:hover{opacity:1}'
 '</style>\n'
)

BACK_LINK = '<a class="mm-back" href="./">&#8592; 返回本课笔记目录</a>\n'

for subject, chapters in SUBJECTS.items():
    d = os.path.join(SITE, '408', subject)
    os.makedirs(d, exist_ok=True)
    lines = ['# %s（408）' % subject, '',
             '> 点击节点展开/折叠；点击 📖 进入对应章节笔记。本文件为 Markmap 大纲源文件，可导入 XMind / 幕布。', '']
    for chapter, points in chapters:
        lines.append('## %s' % chapter)
        lines.append('- %s' % chapter_link(chapter))
        for p in points:
            lines.append('- %s' % p)
        lines.append('')
    md_path = os.path.join(d, '思维导图大纲.md')
    with open(md_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    html_path = os.path.join(d, '思维导图.html')
    subprocess.run('npx -y markmap-cli "%s" -o "%s" --offline --no-open'
                   % (md_path, html_path), check=True, cwd=SITE, shell=True)
    html = open(html_path, encoding='utf-8').read()
    html = re.sub(r'<title>.*?</title>',
                  '<title>%s 思维导图 - 2026考研笔记</title>' % subject,
                  html, count=1, flags=re.DOTALL)
    html = re.sub(r'</head>',
                  FIT_CSS + '</head>', html, count=1)
    html = html.replace('</body>', BACK_LINK + '</body>')
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)
    print('OK %s -> %s' % (md_path, html_path))
