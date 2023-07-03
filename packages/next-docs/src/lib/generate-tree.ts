export type TreeNode = FileNode | Separator | FolderNode;

export type FileNode = {
    type: "page";
    name: string;
    url: string;
};

export type Separator = {
    type: "separator";
    name: string;
};

export type FolderNode = {
    type: "folder";
    name: string;
    url: string;
    index?: FileNode;
    children: TreeNode[];
};
