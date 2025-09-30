#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "min_heap.h"


#define MAX_HEAP_SIZE ???

// Create node
node_t *new_node(char item, unsigned freq){
	node_t *temp = (node_t *)malloc(sizeof(node_t));

	temp->left_p = temp->right_p = NULL;
	temp->item - item;
	temp->freq = freq;

	return temp;
}

// create min_heap
min_heap_t *create_heap(unsigned capacity){
	min_heap_t *heap_p = (min_heap_t *)malloc(sizeof(min_heap_t));
	heap_p->size = 0;

  	heap_p->capacity = capacity;

	heap_p->heap_pp = (struct MinHNode **)malloc(heap_p->capacity * sizeof(node_t *));
	return minHeap;
}

void swap_node(node_t **a,node_t **b) {
  node_t *t = *a;
  *a = *b;
  *b = t;
}

void heapify(node_t *heap_p, int index) {
  int smallest = index;
  int left = 2 * index + 1;
  int right = 2 * index + 2;

  if (left < heap_p->size && heap_p->array[left]->freq < heap_p->array[smallest]->freq)
    smallest = left;

  if (right < heap_p->size && heap_p->array[right]->freq < heap_p->array[smallest]->freq)
    smallest = right;

  if (smallest != index) {
    swap_node(&heap_p->array[smallest], &heap_p->array[index]);
    heapify(heap_p, smallest);
  }
}


// Check if size is 1
int check_size(min_heap_t *heap_p) {
  return (heap_p->size == 1);
}

 min_heap_t *pop(min_heap_t *heap_p) {
  min_heap_t *temp = heap_p->array[0];
  heap_p->array[0] = heap_p->array[heap_p->size - 1];

  --heap_p->size;
  heapify(heap_p, 0);

  return temp;
}

// Insertion function
void insert(min_heap_t *heap_p,node_t *node_p) {
  ++heap_p->size;
  int i = heap_p->size - 1;

  while (i && node_p->freq < heap_p->array[(i - 1) / 2]->freq) {
    heap_p->array[i] = heap_p->array[(i - 1) / 2];
    i = (i - 1) / 2;
  }
  heap_p->array[i] = node_p;
}

// ************************************************ //
void build_min_heap(min_heap_t *heap_p) {
  int n = heap_p->size - 1;
  int i;

  for (i = (n - 1) / 2; i >= 0; --i)
    heapify(heap_p, i);
}

int is_leaf(node_t *root_p) {
  return !(root_p->left_p) && !(root_p->right_p);
}

min_heap_t *create_and_build_min_heap(char item[], int freq[], int size) {
  min_heap_t *heap_p = create_heap(size);

  for (int i = 0; i < size; ++i)
    heap_p->array[i] = new_node(item[i], freq[i]);

  heap_p->size = size;
  build_min_heap(heap_p);

  return heap_p;
}

node_t *build_huffman_tree(char item[], int freq[], int size) {
  node_t *left_p, *right_p, *top_p;
  min_heap_t *heap_p = create_and_build_min_heap(item, freq, size);

  while (!check_size(heap_p)) {
    left_p = pop(heap_p);
    right_p = pop(heap_p);

    top_p = new_node('$', left_p->freq + right_p->freq);

    top_p->left_p = left_p;
    top_p->right_p = right_p;

    insert(heap_p, top_p);
  }
  return pop(heap_p);
}
