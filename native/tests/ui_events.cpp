#include "../host/ui_events.hpp"
#include <cassert>
#include <iostream>
#include <thread>
int main() {
  sy1::UiEvents q;
  for (size_t i = 0; i < q.capacity; ++i) assert(q.push("hostCC", std::to_string(i)));
  assert(!q.push("overflow", "not published"));
  auto full = q.take();
  assert(full.size() == q.capacity);
  for (size_t i = 0; i < full.size(); ++i) assert(full[i].second == std::to_string(i));
  assert(q.take().empty());
  constexpr size_t count = 100000;
  std::thread producer([&] {
    for (size_t i = 0; i < count; ++i) {
      const std::string value = "[1,74," + std::to_string(i) + "]";
      while (!q.push("hostCC", value)) std::this_thread::yield();
    }
  });
  size_t received = 0;
  while (received < count) {
    for (const auto& event : q.take()) {
      assert(event.first == "hostCC");
      assert(event.second == "[1,74," + std::to_string(received++) + "]");
    }
    std::this_thread::yield();
  }
  producer.join();
  assert(q.take().empty());
  std::cout << "UI events: bounded overflow, wraparound and 100000 concurrent ordered events passed\n";
}
